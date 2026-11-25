import { OAuthTokensSchema } from "@modelcontextprotocol/core";
import {
  AuthInfo,
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthError,
  OAuthErrorCode,
  OAuthTokens,
  OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import {
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
} from "@modelcontextprotocol/express";
import { OAuthClientProvider } from "@modelcontextprotocol/client";

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
import {
  logger as alogger,
  authentication_strategy,
  schemas,
} from "aloha-shared";
import * as express from "express";
import * as jose from "jose";
import * as openIdClient from "openid-client";
import { Agent, BodyInit, fetch as undiciFetch } from "undici";
import z from "zod";
import { hasRequestAuthInfoField } from "../../../../aloha-shared/dist-module/authentication-strategy";
import { injector } from "../../injector/injector";
import { getLogger } from "../../injector/provide-logger";
import { assertDefined, unknownToString } from "../../utils/type-utils";

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
  issuer: z.string().min(1),
  authorization_endpoint: z.string().min(1),
  token_endpoint: z.string().min(1),
  revocation_endpoint: z.string().optional(),
});
export type ServerMetadata = z.infer<typeof ServerMetadataSchema>;

export const IdentitySchema = z.object({
  exp: z.number().optional(),
  iat: z.number().optional(),
  username: z.string().optional(),
  scope: z.string(),
  clientId: z.string(),
  name: z.string().optional(),
});
export type Identity = z.infer<typeof IdentitySchema>;

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

export function getTokenSetFromSession(
  req: express.Request
): TokenSet | undefined {
  return (
    (req.session["tokenSet"] as TokenSet) ||
    (hasRequestAuthInfoField(req)
      ? (req.auth?.extra?.tokenSet as TokenSet)
      : undefined)
  );
}

export async function initOpenIdClientConfiguration(
  modifyAssertion: openIdClient.ModifyAssertionOptions | undefined
) {
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

  const h2Dispatcher = new Agent({ allowH2: true });
  const oidcFetch: openIdClient.CustomFetch = (url, options) =>
    undiciFetch(url, {
      ...options,
      body: options.body as BodyInit,
      dispatcher: h2Dispatcher,
    }) as unknown as ReturnType<openIdClient.CustomFetch>;

  const clientAuth = openIdClient.PrivateKeyJwt(key, modifyAssertion);

  const oidcConfiguration = await openIdClient.discovery(
    server,
    clientId,
    {
      id_token_signed_response_alg: "ES512",
    },
    clientAuth,
    {
      execute: [openIdClient.allowInsecureRequests],
      [openIdClient.customFetch]: oidcFetch,
    }
  );
  oidcConfiguration[openIdClient.customFetch] = oidcFetch;
  return oidcConfiguration;
}

export function isJwtTokenSetExpired(tokenSet: TokenSet): boolean {
  const now = Date.now() / 1000;

  const tokenToCheck: string | undefined =
    tokenSet.id_token ?? tokenSet.access_token;

  let decodedJwt: jose.JWTPayload;
  try {
    decodedJwt = jose.decodeJwt(tokenToCheck);
  } catch {
    return false;
  }
  return decodedJwt.exp !== undefined && decodedJwt.exp < now;
}

export function buildTokenSetProviderFromSession(
  req: express.Request
): TokenSetProvider | undefined {
  const idps = injector().resolve("oidcIdentityPropagationService");
  if (!idps) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  return async () => {
    // const tokenFromHeader = req.headers.authorization?.replace("Bearer ", "");
    const currentTokenSet = getTokenSetFromSession(req);
    if (!currentTokenSet) {
      throw Error(`TokenSet not present in session`);
    }
    return currentTokenSet;

    // const token: string =
    //   currentTokenSet?.access_token || tokenFromHeader || "";
    //
    // const idp = await idps;
    //
    // const verificationResult = await idp.resolveToken(token);
    //
    // const newTokenSet = verificationResult.tokenSet || currentTokenSet;
    //
    // if (!newTokenSet) {
    //   return {
    //     access_token: token,
    //   };
    // }
    //
    // storeTokenSetIntoSession(req, newTokenSet);
    //
    // return newTokenSet;

    // const tokenSet = getTokenSetFromSession(req);
    // if (tokenSet) {
    //   //   const idpsInstance = await idps;
    //   //   const newTokenSet: TokenSet =
    //   //     await idpsInstance.refreshTokenSet(tokenSet);
    //   //   storeTokenSetIntoSession(req, newTokenSet);
    //   //   return tokenSet;
    //   // }
    //   return tokenSet;
    // }
    //
    //
    // return {
    //   access_token: token || "",
    //   // Recover the end-user refresh token stored at login so identity
    //   // propagation (token exchange) has the refresh_token subject EU Login
    //   // requires; the request itself only carries the access token.
    //   refresh_token: token,
    // };
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
          throw new OAuthError(
            OAuthErrorCode.InvalidToken,
            unknownToString(error)
          );
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
      if (authentication_strategy.isUserAuthenticated(req)) {
        return next();
      }
      if (!authentication_strategy.hasRequestAuthInfoField(req)) {
        return middleware(req, res, next);
      }
      return next();
    };
  } else {
    oidcAuthMiddleware = (_req, _res, next) => next();
  }

  return oidcAuthMiddleware;
}

/**
 * Derives ALOHA's base URI from the registered OIDC code redirect URI. Used to
 * advertise the Protected Resource Metadata URL for bearer-auth challenges.
 */
function getBaseUriFromOidcRedirectUri() {
  const codeRedirectUri = injector().resolve("oidcCodeRedirectUri");
  assertDefined(codeRedirectUri);
  const codeRedirectURL = new URL(codeRedirectUri);
  const baseUrl = `${codeRedirectURL.protocol}//${codeRedirectURL.host}`;
  return baseUrl;
}

export function resolveDisplayName(
  claims: jose.JWTPayload,
  username: string | undefined
): string {
  const clean = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalised = value
      .split(/\s+/)
      .filter((part) => part && part !== "null" && part !== "undefined")
      .join(" ")
      .trim();
    return normalised.length > 0 ? normalised : undefined;
  };

  const composed = clean(
    [claims["given_name"], claims["family_name"]]
      .filter((p) => typeof p === "string")
      .join(" ")
  );

  return (
    clean(claims["name"]) ??
    composed ??
    clean(claims["nickname"]) ??
    (username || "Unknown")
  );
}

export async function createUserPrincipalFromIdentity(
  token: string,
  identity: Identity,
  getUserDetail: authentication_strategy.GetUserDetailFunction,
  ttl: number | undefined
): Promise<authentication_strategy.UserPrincipal | null> {
  return tokensCache().get(
    token,
    async () => {
      const username = identity.username;

      if (!username || typeof username !== "string") {
        logger().child({ identity }).error("Unable to find username");
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
            .child({ username })
            .error("User is unknown by Aloha and allowUnknownUsers is not set");
          return null;
        } else {
          const id = "__unknownUser." + username;

          const tempUser: schemas.UserWithId = {
            id,
            userId: id,
            permissions: unknownUsersDefaultPermissions,
            fullName: identity.name || "Unknown",
            disabled: false,
          };

          usersCache().put(
            id,
            tempUser,
            identity.exp ? Date.now() - identity.exp : undefined
          );

          return createPrincipalFromUserDetail(tempUser);
        }
      } else {
        if (userDetail.disabled === true) {
          logger().child({ username }).error("User is disabled in Aloha");
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

  let identity: Identity;
  let tokenSet: TokenSet | undefined;
  try {
    const tokenVerification = await idps.resolveToken(token);
    identity = tokenVerification.identity;
    tokenSet = tokenVerification.tokenSet;
  } catch (err) {
    logger()
      .child({ error: unknownToString(err) })
      .debug("Invalid token");
    throw err;
  }

  const expiresAt = identity.exp;

  const authInfo: AuthInfo & { extra: Record<string, unknown> } = {
    token,
    clientId: identity.clientId,
    scopes: identity.scope.split(" "),
    expiresAt: identity.exp,
    extra: {
      tokenSet,
    },
  };

  if (getUserDetail) {
    const ttl =
      typeof expiresAt === "number" ? Date.now() - expiresAt : undefined;
    const principal = await createUserPrincipalFromIdentity(
      token,
      identity,
      getUserDetail,
      ttl
    );
    if (!principal) {
      logger()
        .child({
          identity,
        })
        .warn(
          "Access token is valid but no ALOHA user principal could be " +
            "resolved (unknown/disabled user, and allowUnknownUsers is off)"
        );
    }
    authInfo.extra["user"] = principal;
  }

  return authInfo;
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
  return newTokenSet;
}

export class TokenExchangeAuthProvider implements OAuthClientProvider {
  private logger: () => alogger.Logger;

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
    const exchangedToken = await exchangeAccessToken(
      this.clientId,
      this.tokenSetProvider
    );

    return OAuthTokensSchema.parse({
      ...exchangedToken,
      token_type: exchangedToken.token_type ?? "bearer",
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
