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

import { injector } from "../../injector/injector";
import {
  IdentityPropagationService,
  IdentityPropagationServiceInfo,
} from "./identity-propagation-service";
import {
  ClientRegistrationMetadata,
  ClientRegistrationMetadataSchema,
  initOpenIdClientConfiguration,
  ServerMetadata,
  ServerMetadataSchema,
  TokenSet,
  TokenSetSchema,
} from "./oidc-support";
import * as openIdClient from "openid-client";
import * as jose from "jose";
import { getLogger } from "../../injector/provide-logger";

const PROVIDER_NAME = "KEYCLOCK-IDPS";
const logger = getLogger(PROVIDER_NAME);

export class KeycloakIdentityPropagationService implements IdentityPropagationService {
  private oidcConfiguration!: openIdClient.Configuration;
  private alohaTokenSet!: TokenSet;

  async init(): Promise<void> {
    this.oidcConfiguration = await initOpenIdClientConfiguration();
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
      this.alohaTokenSet = await this.refreshTokenSet(this.alohaTokenSet);
    }

    return this.alohaTokenSet;
  }

  public refreshTokenSet(tokenSet: TokenSet): Promise<TokenSet> {
    if (tokenSet.refresh_token) {
      return openIdClient.refreshTokenGrant(
        this.oidcConfiguration,
        tokenSet.refresh_token
      );
    }
    return this.getCredentialGrantTokenSet();
  }

  public async verifyToken(token: string): Promise<boolean> {
    try {
      const introspection = await openIdClient.tokenIntrospection(
        this.oidcConfiguration,
        token
      );
      return introspection.active;
    } catch (e) {
      logger()
        .child({ token, error: e })
        .error(`Unable to introspect the token`);
      return false;
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
