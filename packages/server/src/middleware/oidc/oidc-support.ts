/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the "Licence");
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/

import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
  OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  logger as alogger,
  authentication_strategy,
  schemas,
} from "aloha-shared";
import * as express from "express";
import * as jose from "jose";
import * as openIdClient from "openid-client";
import z from "zod";
import { injector } from "../../injector/injector";
import { getLogger } from "../../injector/provide-logger";
import { assertDefined, unknownToString } from "../../utils/type-utils";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

export const OIDC_PROVIDER_NAME = "OIDC";
export const ClientRegistrationMetadataSchema = z.object({
  redirect_uris: z.array(z.string().min(1)),
  token_endpoint_auth_method: z.string().min(1),
  grant_types: z.array(z.string().min(1)),
  response_types: z.array(z.string().min(1)),
  client_id: z.string().min(1),
  client_name: z.string(),
  client_uri: z.string().optional(),
  scope: z.string(),
  root_url: z.string().optional(),
  secret: z.string().optional(),
});
export type ClientRegistrationMetadata = z.infer<
  typeof ClientRegistrationMetadataSchema
>;

export const ServerMetadataSchema = z.object({
  authorization_endpoint: z.string().min(1),
  token_endpoint: z.string().min(1),
  revocation_endpoint: z.string().optional(),
});
export type ServerMetadata = z.infer<typeof ServerMetadataSchema>;

export const TokenSetSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z
    .enum(["bearer", "dpop"])
    .or(z.string().toLowerCase())
    .optional(),
});
export type TokenSet = z.infer<typeof TokenSetSchema>;
export type TokenSetProvider = () => Promise<TokenSet>;

export function storeTokenSetIntoSession(
  req: express.Request,
  tokenSet: TokenSet
) {
  req.session["tokenSet"] = tokenSet;
}

const logger = getLogger("OIDC-SUPPORT");
const tokensCache = () => injector().resolve("jwtCache");
const usersCache = () => injector().resolve("usersCache");

export function getTokenSetFromSession(req: express.Request): TokenSet {
  return req.session["tokenSet"] as TokenSet;
}

export async function initOpenIdClientConfiguration() {
  const oidcIssuerUrl = injector().resolve("oidcIssuerUrl");
  if (!oidcIssuerUrl) {
    throw new Error(`No OIDC_ISSUER_URL variable provided`);
  }

  const clientId = injector().resolve("oidcClientId");
  if (!clientId) {
    throw new Error(`No OIDC_CLIENT_ID variable provided`);
  }

  const jwks = injector().resolve("oidcJWKS");
  if (!jwks) {
    throw new Error(`No OIDC_JWKS variable provided`);
  }

  const server = new URL(oidcIssuerUrl);

  const jsonKeyStore = JSON.parse(jwks) as jose.JSONWebKeySet;

  const key = (await jose.importJWK(jsonKeyStore.keys[0])) as jose.CryptoKey;

  const oidcConfiguration = await openIdClient.discovery(
    server,
    clientId,
    {
      id_token_signed_response_alg: "ES512",
    },
    openIdClient.PrivateKeyJwt(key),
    {
      execute: [openIdClient.allowInsecureRequests],
    }
  );
  return oidcConfiguration;
}

export function isJwtTokenExpired(tokenSet: TokenSet): boolean;
export function isJwtTokenExpired(token: string): boolean;
export function isJwtTokenExpired(token: string | TokenSet) {
  let tokenToCheck: string;
  if (typeof token === "string") {
    tokenToCheck = token;
  } else {
    tokenToCheck = token.access_token;
  }
  const now = Date.now() / 1000;
  const decodedJwt = jose.decodeJwt(tokenToCheck);
  return decodedJwt.exp && decodedJwt.exp < now;
}

export function buildTokenSetProviderFromRequest(
  req: express.Request
): TokenSetProvider | undefined {
  const idps = injector().resolve("oidcIdentityPropagationService");
  if (!idps) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  return async () => {
    const tokenSet = getTokenSetFromSession(req);
    if (tokenSet) {
      //   const idpsInstance = await idps;
      //   const newTokenSet: TokenSet =
      //     await idpsInstance.refreshTokenSet(tokenSet);
      //   storeTokenSetIntoSession(req, newTokenSet);
      //   return tokenSet;
      // }
      return tokenSet;
    }

    const token = req.headers.authorization?.replace("Bearer ", "");

    return {
      access_token: token || "",
    } as TokenSet;
  };
}

export function createOptionalMCPOidcAuthMiddleware(
  module: string,
  getUserDetail: (username: string) => Promise<schemas.UserWithId | null>
): express.RequestHandler {
  const oidcIDPS = injector().resolve("oidcIdentityPropagationService");
  let oidcAuthMiddleware: express.RequestHandler;

  if (oidcIDPS) {
    const baseUri = getBaseUriFromOidcRedirectUri();
    logger().child({ module }).info("Creating OIDC MCP Auth Middleware");
    const tokenVerifier: OAuthTokenVerifier = {
      async verifyAccessToken(token: string): Promise<AuthInfo> {
        try {
          return await verifyAccessTokenAgainstIdentityProvider(
            token,
            getUserDetail
          );
        } catch (error) {
          throw new InvalidTokenError(unknownToString(error));
        }
      },
    };

    const middleware = requireBearerAuth({
      verifier: tokenVerifier,
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
        new URL(baseUri)
      ),
    });
    oidcAuthMiddleware = (req, res, next) => {
      if (!authentication_strategy.isUserAuthenticated(req)) {
        return middleware(req, res, next);
      }
      return next();
    };
  } else {
    oidcAuthMiddleware = (_req, _res, next) => next();
  }

  return oidcAuthMiddleware;
}

export async function setupOptionalOAuthProxy(app: express.Router) {
  const oidcIDPS = injector().resolve("oidcIdentityPropagationService");
  if (!oidcIDPS) {
    return;
  }

  logger().info(
    "Identity Propagation Service is enabled, initializing OAuthServerProvider..."
  );

  const idps = await oidcIDPS;
  const serverMetadata: ServerMetadata = idps.getServerMetadata();

  const proxyProvider = new ProxyOAuthServerProvider({
    // fetch: (url, options) => {
    //   console.log("url", url);
    //   console.log("options", options);
    //   return global.fetch(url, options);
    // },
    endpoints: {
      authorizationUrl: serverMetadata.authorization_endpoint,
      tokenUrl: serverMetadata.token_endpoint,
      revocationUrl: serverMetadata.revocation_endpoint,
    },
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      return verifyAccessTokenAgainstIdentityProvider(token);
    },

    async getClient(clientId: string) {
      const idps = await oidcIDPS;
      const metadata = await idps.getClientRegistration(clientId);
      return {
        client_id: clientId,
        redirect_uris: metadata.redirect_uris,
      };
    },
  });

  const baseUri = getBaseUriFromOidcRedirectUri();

  app.use(
    mcpAuthRouter({
      provider: proxyProvider,
      issuerUrl: new URL(baseUri),
      baseUrl: new URL("/api/mcp", baseUri),
    }),
    mcpAuthRouter({
      provider: proxyProvider,
      issuerUrl: new URL(baseUri),
      baseUrl: new URL("/api/a2a", baseUri),
    })
  );
}

function getBaseUriFromOidcRedirectUri() {
  const codeRedirectUri = injector().resolve("oidcCodeRedirectUri");
  assertDefined(codeRedirectUri);
  const codeRedirectURL = new URL(codeRedirectUri);
  const baseUrl = `${codeRedirectURL.protocol}//${codeRedirectURL.host}`;
  return baseUrl;
}

export async function createUserPrincipalFromToken(
  token: string,
  getUserDetail: authentication_strategy.GetUserDetailFunction,
  ttl: number | undefined
): Promise<authentication_strategy.UserPrincipal | null> {
  return tokensCache().get(
    token,
    async () => {
      const decodedJwt = jose.decodeJwt(token);

      const username =
        decodedJwt["preferred_username"] || decodedJwt["username"];

      if (!username || typeof username !== "string") {
        logger()
          .child({ decodedJwt })
          .error("Unable to find preferred_username / username field");
        return null;
      }

      const userDetail = await getUserDetail(username);

      const allowUnknownUsers = injector().resolve("oidcUnknownUsersAllow");
      const unknownUsersDefaultPermissions = injector().resolve(
        "oidcUnknownUsersPermissions"
      );

      if (!userDetail) {
        if (!allowUnknownUsers) {
          logger()
            .child({ decodedJwt, username })
            .error("User is unknown by Aloha and allowUnknownUsers is not set");
          return null;
        } else {
          const id = "__unknownUser." + username;

          const tempUser: schemas.UserWithId = {
            id,
            userId: id,
            permissions: unknownUsersDefaultPermissions,
            fullName: (decodedJwt.name as string) || username,
            disabled: false,
          };

          usersCache().put(
            id,
            tempUser,
            decodedJwt.exp ? Date.now() - decodedJwt.exp : undefined
          );

          return createPrincipalFromUserDetail(tempUser);
        }
      } else {
        if (userDetail.disabled === true) {
          logger()
            .child({ decodedJwt, username })
            .error("User is disabled in Aloha");
          return null;
        } else {
          return createPrincipalFromUserDetail(userDetail);
        }
      }
    },
    ttl
  );
}

function createPrincipalFromUserDetail(userDetail: schemas.UserWithId) {
  return {
    id: userDetail.id,
    userId: userDetail.userId,
    displayName: userDetail.fullName,
    permissions: userDetail.permissions,
    provider: OIDC_PROVIDER_NAME,
  } as authentication_strategy.UserPrincipal;
}

async function verifyAccessTokenAgainstIdentityProvider(
  token: string,
  getUserDetail?: authentication_strategy.GetUserDetailFunction
): Promise<AuthInfo> {
  const oidcIDPS = injector().resolve("oidcIdentityPropagationService");
  const idps = await oidcIDPS;
  assertDefined(idps);
  const isValid = await idps.verifyToken(token);
  if (isValid) {
    const decodedJwt = jose.decodeJwt(token);

    return {
      token,
      clientId: decodedJwt.client_id || decodedJwt.azp,
      scopes:
        decodedJwt.scope && typeof decodedJwt.scope === "string"
          ? decodedJwt.scope.split(" ")
          : [],
      expiresAt: decodedJwt.exp,
      ...(getUserDetail
        ? {
            extra: {
              user: await createUserPrincipalFromToken(
                token,
                getUserDetail,
                decodedJwt.exp ? Date.now() - decodedJwt.exp : undefined
              ),
            },
          }
        : {}),
    } as AuthInfo;
  }
  const msg = "Invalid or expired token";
  logger().error(msg);
  throw new Error(msg);
}

async function exchangeAccessToken(
  clientId: string,
  tokenSetProvider: TokenSetProvider | undefined
) {
  const oidcIdentityPropagationServicePromise = injector().resolve(
    "oidcIdentityPropagationService"
  );

  const oidcIdentityPropagationService =
    await oidcIdentityPropagationServicePromise;

  if (!oidcIdentityPropagationService) {
    throw Error(
      `Unable to use OIDC authentication because it's not configured`
    );
  }

  if (!tokenSetProvider) {
    throw Error(
      `TokenSet not provided, please enable OIDC Authentication middleware`
    );
  }

  const tokenSetToExchange = await tokenSetProvider();

  const newTokenSet = await oidcIdentityPropagationService.tokenExchange(
    tokenSetToExchange,
    clientId
  );
  return newTokenSet.access_token;
}

export class TokenExchangeAuthProvider implements OAuthClientProvider {
  private logger: () => alogger.Logger;
  private lastExchangedToken: string | undefined;

  constructor(
    private clientId: string,
    private tokenSetProvider: TokenSetProvider | undefined
  ) {
    this.logger = () =>
      getLogger("TOKEN-EXCHANGE-AUTH-PROVIDER")().child({ clientId });
  }
  get redirectUrl() {
    this.logger().debug("redirectUrl");
    return "";
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [""],
    };
  }

  clientInformation():
    | OAuthClientInformation
    | undefined
    | Promise<OAuthClientInformation | undefined> {
    this.logger().debug("clientInformation");
    return {
      client_id: this.clientId,
    };
  }
  async tokens(): Promise<OAuthTokens | undefined> {
    this.logger().debug("Get tokens");
    if (
      !this.lastExchangedToken ||
      isJwtTokenExpired(this.lastExchangedToken)
    ) {
      this.logger().debug("Exchange token");
      const exchangedToken = await exchangeAccessToken(
        this.clientId,
        this.tokenSetProvider
      );
      this.lastExchangedToken = exchangedToken;
    }
    return OAuthTokensSchema.parse({
      access_token: this.lastExchangedToken,
      token_type: "urn:ietf:params:oauth:token-type:access_token",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  saveTokens(_tokens: OAuthTokens): void | Promise<void> {
    this.logger().debug("saveTokens");
  }

  redirectToAuthorization(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _authorizationUrl: URL
  ): void | Promise<void> {
    this.logger().debug("redirectToAuthorization");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  saveCodeVerifier(_codeVerifier: string): void | Promise<void> {
    this.logger().debug("saveCodeVerifier");
  }

  codeVerifier(): string | Promise<string> {
    this.logger().debug("codeVerifier");
    return "";
  }
}
