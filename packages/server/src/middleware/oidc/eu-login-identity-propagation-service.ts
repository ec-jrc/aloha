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

import * as openIdClient from "openid-client";
import { injector } from "../../injector/injector";
import { getLogger } from "../../injector/provide-logger";
import {
  IdentityPropagationService,
  IdentityPropagationServiceInfo,
  TokenResolutionResult,
} from "./identity-propagation-service";
import {
  ClientRegistrationMetadata,
  initOpenIdClientConfiguration,
  resolveDisplayName,
  ServerMetadata,
  ServerMetadataSchema,
  TokenSet,
  TokenSetSchema,
} from "./oidc-support";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const TOKEN_TYPE_ACCESS = "urn:ietf:params:oauth:token-type:access_token";
const TOKEN_TYPE_REFRESH = "urn:ietf:params:oauth:token-type:refresh_token";

const PROVIDER_NAME = "EULOGIN-IDPS";
const logger = getLogger(PROVIDER_NAME);

export class EULoginIdentityPropagationService implements IdentityPropagationService {
  private oidcConfiguration!: openIdClient.Configuration;
  private alohaTokenSet!: TokenSet;
  private alohaTokenExpiresAt = 0;

  // eslint-disable-next-line @typescript-eslint/require-await
  async getConfiguration(): Promise<openIdClient.Configuration> {
    return this.oidcConfiguration;
  }
  async init(): Promise<void> {
    const oidcIssuerUrl = injector().resolve("oidcIssuerUrl");
    if (!oidcIssuerUrl) {
      throw new Error(`No OIDC_ISSUER_URL variable provided`);
    }
    const server = new URL(oidcIssuerUrl);
    const issuerBase = server.href.replace(/\/$/, "");
    this.oidcConfiguration = await initOpenIdClientConfiguration({
      [openIdClient.modifyAssertion]: (_header, payload) => {
        payload.aud = [
          `${issuerBase}/token`,
          `${issuerBase}/par`,
          `${issuerBase}/token/introspect`,
          `${issuerBase}/token/revoke`,
        ];
      },
    });

    this.alohaTokenSet = await this.getAlohaTokenSet();
    logger()
      .child({
        alohaTokenSet: this.alohaTokenSet,
      })
      .debug("Aloha TokenSet");
  }

  getInfo(): Promise<IdentityPropagationServiceInfo> {
    return Promise.resolve({
      provider: PROVIDER_NAME,
    });
  }

  async tokenExchange(tokenSet: TokenSet, audience: string): Promise<TokenSet> {
    try {
      let tokenResponse: openIdClient.TokenEndpointResponse &
        openIdClient.TokenEndpointResponseHelpers;

      if (tokenSet.refresh_token) {
        // Identity-propagation flow (RFC 8693 Token Exchange).
        //
        // EU Login requires the token-exchange subject to be a RefreshToken
        // ("Invalid token type for token exchange, must be a RefreshToken" is
        // returned for an access-token subject). ALOHA obtains the end-user
        // refresh token at login and recovers it here (keyed by the access
        // token presented on the request) so the user identity is preserved:
        // the exchanged access token introspects, at EU Login, as the end user
        // rather than as ALOHA's job account.
        //
        // The requested `audience` is the target application's client id and
        // must be authorised as an exchange target for ALOHA's client in EU
        // Login; otherwise EU Login rejects the request with an invalid
        // audience error.
        tokenResponse = await openIdClient.genericGrantRequest(
          this.oidcConfiguration,
          "urn:ietf:params:oauth:grant-type:token-exchange",
          {
            subject_token: tokenSet.refresh_token,
            subject_token_type:
              "urn:ietf:params:oauth:token-type:refresh_token",
            audience: audience,
            scope: injector().resolve("oidcScope"),
            requested_token_type:
              "urn:ietf:params:oauth:token-type:access_token",
          }
        );
      } else {
        // logger().warn(
        //   "tokenExchange invoked without an end-user refresh token; falling " +
        //     "back to client-credentials (job account). User identity will " +
        //     "NOT be propagated for this call."
        // );
        tokenResponse = await openIdClient.clientCredentialsGrant(
          this.oidcConfiguration,
          {
            requested_token_type:
              "urn:ietf:params:oauth:token-type:access_token",
            audience: audience,
          }
        );
      }

      return TokenSetSchema.parse({ ...tokenResponse });
    } catch (err) {
      logger().error(err);
      throw err;
    }
  }

  async getUsername(tokenSet: TokenSet): Promise<string> {
    const userInfo = await openIdClient.fetchUserInfo(
      this.oidcConfiguration,
      tokenSet.access_token,
      openIdClient.skipSubjectCheck
    );
    return userInfo.preferred_username!;
  }

  async getAlohaTokenSet(forceRefresh: boolean = false): Promise<TokenSet> {
    if (!this.alohaTokenSet || forceRefresh) {
      this.alohaTokenSet = await this.getCredentialGrantTokenSet();
      return this.alohaTokenSet;
    }

    const now = Date.now() / 1000;

    if (this.alohaTokenExpiresAt <= now || forceRefresh) {
      this.alohaTokenSet = await this.getCredentialGrantTokenSet();
    }

    return this.alohaTokenSet;
  }

  public async resolveToken(token: string): Promise<TokenResolutionResult> {
    const cache = injector().resolve("oidcTokenResolutionCache");
    const cached = cache.getSyncValue(token);
    if (cached) {
      return cached;
    }

    const result = await this.doResolveToken(token);

    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds =
      result.identity.exp !== undefined
        ? result.identity.exp - now
        : undefined;
    if (ttlSeconds === undefined || ttlSeconds > 0) {
      cache.put(token, result, ttlSeconds);
    }

    return result;
  }

  private async doResolveToken(
    token: string
  ): Promise<TokenResolutionResult> {
    try {
      const identityContext = await this.deriveIdentityContext(token);
      const introspection = await openIdClient.tokenIntrospection(
        this.oidcConfiguration,
        identityContext.ownAccessToken
      );
      if (!introspection.active) {
        logger()
          .child({ introspection })
          .warn(
            "Token introspection returned active=false; the token will be " +
              "rejected as invalid_token"
          );
        throw new Error("Token is not active");
      }

      const oidcClientId = injector().resolve("oidcClientId");
      if (!oidcClientId) {
        throw Error(`Unable to recover ALOHA client id`);
      }
      const tokenSet = {
        access_token: "all access token consumed",
        refresh_token: identityContext.refreshToken,
      };

      const username =
        (introspection.preferred_username as string | undefined) ||
        introspection.username ||
        introspection.sub;

      return {
        tokenSet,
        identity: {
          clientId:
            introspection.client_id ||
            (introspection.azp as string | undefined) ||
            "unknown client id",
          scope: introspection.scope || injector().resolve("oidcScope"),
          exp: introspection.exp,
          iat: introspection.iat,
          username,
          name: resolveDisplayName(introspection, username),
        },
      };
    } catch (e) {
      logger()
        .child({ token, error: e })
        .error(`Unable to introspect the token`);
      throw e;
    }
  }

  public async getClientRegistration(
    clientId: string
  ): Promise<ClientRegistrationMetadata> {
    const redirectUris = await this.findRedirectUrisByClientId(clientId);

    if (!redirectUris) {
      throw new Error(
        `No client or agent found with OIDC client id matching the requested registration`
      );
    }

    return {
      client_id: clientId,
      client_name: clientId,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: injector().resolve("oidcScope"),
    };
  }

  public getServerMetadata(): ServerMetadata {
    return ServerMetadataSchema.parse(this.oidcConfiguration.serverMetadata());
  }

  private async deriveIdentityContext(incomingAccessToken: string) {
    const oidcClientId = injector().resolve("oidcClientId");
    if (!oidcClientId) {
      throw Error(`Unable to recover ALOHA client id`);
    }
    const res = await openIdClient.genericGrantRequest(
      this.oidcConfiguration,
      TOKEN_EXCHANGE_GRANT,
      {
        subject_token: incomingAccessToken,
        subject_token_type: TOKEN_TYPE_ACCESS,
        // Own audience: calculator1's client id.
        audience: oidcClientId,
        requested_token_type: TOKEN_TYPE_REFRESH,
      }
    );
    if (!res.refresh_token) {
      throw new Error("AT->RT exchange did not return a refresh_token");
    }
    return {
      refreshToken: res.refresh_token,
      ownAccessToken: res.access_token,
    };
  }

  private async findRedirectUrisByClientId(
    clientId: string
  ): Promise<string[] | undefined> {
    const connectionOptionsRepository = injector().resolve(
      "connectionOptionsRepository"
    );
    const agentRepository = injector().resolve("agentRepository");

    const clients = await connectionOptionsRepository.findByPattern({});
    const matchingClient = clients.find(
      (client) =>
        client.authentication?.type === "oidc_client_secret" &&
        client.authentication.clientId === clientId
    );
    if (matchingClient?.authentication?.type === "oidc_client_secret") {
      return [];
    }

    const agents = await agentRepository.findByPattern({});
    const matchingAgent = agents.find(
      (agent) =>
        agent.authentication?.type === "oidc_client_secret" &&
        agent.authentication.clientId === clientId
    );
    if (matchingAgent?.authentication?.type === "oidc_client_secret") {
      return [];
    }

    return undefined;
  }

  private async getCredentialGrantTokenSet() {
    const audience = injector().resolve("oidcAudience");
    const parameters: Record<string, string> = {};
    if (audience) {
      parameters.audience = audience;
    }
    const clientGrant = await openIdClient.clientCredentialsGrant(
      this.oidcConfiguration,
      parameters
    );
    const tokenSet = TokenSetSchema.parse(clientGrant);
    this.setTokenExpiry(tokenSet);
    return tokenSet;
  }

  private setTokenExpiry(tokenSet: TokenSet): void {
    const now = Date.now() / 1000;
    const marginSeconds = 30;
    this.alohaTokenExpiresAt = tokenSet.expires_in
      ? now + tokenSet.expires_in - marginSeconds
      : now;
  }
}

export default new EULoginIdentityPropagationService();
