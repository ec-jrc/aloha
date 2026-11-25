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

import * as jose from "jose";
import * as openIdClient from "openid-client";
import { injector } from "../../injector/injector";
import { getLogger } from "../../injector/provide-logger";
import { unknownToString } from "../../utils/type-utils";
import {
  IdentityPropagationService,
  IdentityPropagationServiceInfo,
  TokenResolutionResult,
} from "./identity-propagation-service";
import {
  ClientRegistrationMetadata,
  ClientRegistrationMetadataSchema,
  initOpenIdClientConfiguration,
  resolveDisplayName,
  ServerMetadata,
  ServerMetadataSchema,
  TokenSet,
  TokenSetSchema,
} from "./oidc-support";

const PROVIDER_NAME = "KEYCLOAK-IDPS";
const logger = getLogger(PROVIDER_NAME);

export class KeycloakIdentityPropagationService implements IdentityPropagationService {
  private oidcConfiguration!: openIdClient.Configuration;
  private alohaTokenSet!: TokenSet;

  // eslint-disable-next-line @typescript-eslint/require-await
  async getConfiguration(): Promise<openIdClient.Configuration> {
    return this.oidcConfiguration;
  }

  async init(): Promise<void> {
    this.oidcConfiguration = await initOpenIdClientConfiguration(undefined);
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
    const tokenResponse = await openIdClient.genericGrantRequest(
      this.oidcConfiguration,
      "urn:ietf:params:oauth:grant-type:token-exchange",
      {
        subject_token: tokenSet.access_token,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        audience: audience,
        scope: injector().resolve("oidcScope"),
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      }
    );
    return TokenSetSchema.parse(tokenResponse);
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

    const accessTokenDecoded = jose.decodeJwt(this.alohaTokenSet.access_token);

    const now = Date.now() / 1000;

    const tokenExpiryTime = accessTokenDecoded.exp || now + 1;

    if (tokenExpiryTime < now || forceRefresh) {
      this.alohaTokenSet = await this.getCredentialGrantTokenSet();
    }

    return this.alohaTokenSet;
  }

  public async resolveToken(token: string): Promise<TokenResolutionResult> {
    try {
      const introspection = await openIdClient.tokenIntrospection(
        this.oidcConfiguration,
        token
      );
      if (!introspection.active) {
        throw Error(`Token is not active`);
      }

      const username =
        (introspection.preferred_username as string | undefined) ||
        introspection.username ||
        introspection.sub;

      return {
        tokenSet: { access_token: token },
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
        .child({ error: unknownToString(e) })
        .error(`Unable to introspect the token`);
      throw e;
    }
  }

  public async getClientRegistration(
    clientId: string
  ): Promise<ClientRegistrationMetadata> {
    const clientEndpoint =
      this.oidcConfiguration.serverMetadata().registration_endpoint;
    const tokenSet = await this.getAlohaTokenSet();
    const resp = await global.fetch(clientEndpoint + "/" + clientId, {
      headers: {
        authorization: "Bearer " + tokenSet.access_token,
      },
    });
    const json = ClientRegistrationMetadataSchema.parse(await resp.json());
    return json;
  }

  public getServerMetadata(): ServerMetadata {
    return ServerMetadataSchema.parse(this.oidcConfiguration.serverMetadata());
  }

  private async getCredentialGrantTokenSet() {
    const clientGrant = await openIdClient.clientCredentialsGrant(
      this.oidcConfiguration
    );
    return TokenSetSchema.parse(clientGrant);
  }
}
