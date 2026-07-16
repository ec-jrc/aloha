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

import z from "zod";
import { injector } from "../../injector/injector";
import { getLogger } from "../../injector/provide-logger";
import {
  ClientRegistrationMetadataRequest,
  IdentityPropagationServiceRegistrar,
} from "./identity-propagation-service-registrar";

const logger = getLogger("KEYCLOACK-DEFAULT-REGISTRAR");

type HTTPVerb = "GET" | "POST" | "PUT" | "DELETE";

const KCRoleRepresentationSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
});

const KCGroupRepresentationSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  path: z.string().optional(),
  clientRoles: z.record(z.string(), z.array(z.string())).optional(),
});

const KCProtocolMapperSchema = z.object({
  name: z.string(),
  protocol: z.string(),
  protocolMapper: z.string(),
  consentRequired: z.boolean(),
  config: z.record(z.string(), z.string()),
});
// type KCProtocolMapper = z.infer<typeof KCProtocolMapperSchema>;

const KCClientRepresentationSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().optional(),
  name: z.string().optional(),
  rootUrl: z.string().optional(),
  adminUrl: z.string().optional(),
  baseUrl: z.string().optional(),
  secret: z.string().optional(),
  registrationAccessToken: z.string().optional(),
  defaultRoles: z.array(z.string()).optional(),
  redirectUris: z.array(z.string()).optional(),
  publicClient: z.boolean().optional(),
  clientAuthenticatorType: z.string().optional(),
  serviceAccountsEnabled: z.boolean().optional(),
  directAccessGrantsEnabled: z.boolean().optional(),
  protocol: z.string().optional(),
  protocolMappers: z.array(KCProtocolMapperSchema).optional(),
  enabled: z.boolean().optional(),
  webOrigins: z.array(z.string()).optional(),
  standardFlowEnabled: z.boolean().optional(),
});

type KCClientRepresentation = z.infer<typeof KCClientRepresentationSchema>;

export class KeyCloakIdentityPropagationServiceDefaultRegistrar implements IdentityPropagationServiceRegistrar {
  private issuerUrl!: string;
  private realm!: string;

  public async unregisterClient(clientId: string): Promise<void> {
    logger().child({ clientId: clientId }).debug("Unregistering client");

    const client = await this.getClientByClientId(clientId);
    if (!client) {
      return;
    }

    const clientUUID = client.id!;

    await this.removeAudienceMapper(clientId);

    await this.callKC(
      `/admin/realms/${this.realm}/clients/${clientUUID}`,
      "DELETE"
    );

    await this.refreshAlohaTokenSet();
  }

  public async registerClient(
    client: ClientRegistrationMetadataRequest
  ): Promise<void> {
    logger().child({ clientId: client.client_id }).debug("Registering client");

    const alreadyPresentClient = await this.getClientByClientId(
      client.client_id
    );

    if (alreadyPresentClient) {
      throw new Error(`Client with ID '${client.client_id}' already exists.`);
    }

    const clientRepresentation: KCClientRepresentation = {
      clientId: client.client_id,
      name: client.client_name,
      rootUrl: client.root_url,
      redirectUris: client.redirect_uris,
      secret: client.secret,
      clientAuthenticatorType: "client-secret",
      serviceAccountsEnabled: true,
      directAccessGrantsEnabled: false,
      publicClient: false,
      protocol: "openid-connect",
      webOrigins: ["*"],
      enabled: true,
      standardFlowEnabled: true,
      // protocolMappers: [
      //   {
      //     name: "aloha-audience",
      //     protocol: "openid-connect",
      //     protocolMapper: "oidc-audience-mapper",
      //     consentRequired: false,
      //     config: {
      //       "included.client.audience": "aloha",
      //       "id.token.claim": "false",
      //       "lightweight.claim": "false",
      //       "access.token.claim": "true",
      //       "introspection.token.claim": "true",
      //     },
      //   },
      // ],
    };

    const newClient: KCClientRepresentation = await this.callKC(
      "clients-registrations/default",
      "POST",
      KCClientRepresentationSchema,
      clientRepresentation
    );

    const clientUUID = newClient.id!;

    await this.callKC(
      `/admin/realms/${this.realm}/clients/${clientUUID}/roles`,
      "POST",
      undefined,
      {
        name: `${client.client_id}-role`,
        composite: false,
        clientRole: true,
      }
    );
    const newRoles = await this.callKC(
      `/admin/realms/${this.realm}/clients/${clientUUID}/roles`,
      "GET",
      z.array(KCRoleRepresentationSchema)
    );

    if (newRoles.length === 0) {
      throw new Error("No roles created after registration");
    }

    const groups = await this.callKC(
      `/admin/realms/${this.realm}/groups`,
      "GET",
      z.array(KCGroupRepresentationSchema)
    );

    const alohaGroupUUID = groups.find((e) => e.name === "aloha-group")?.id;
    if (!alohaGroupUUID) {
      throw new Error("Aloha group not found");
    }

    await this.callKC(
      `/admin/realms/${this.realm}/groups/${alohaGroupUUID}/role-mappings/realm`,
      "POST",
      undefined,
      []
    );

    await this.callKC(
      `/admin/realms/${this.realm}/groups/${alohaGroupUUID}/role-mappings/clients/${clientUUID}`,
      "POST",
      undefined,
      newRoles
    );

    await this.addAudienceMapper(client.client_id);

    await this.refreshAlohaTokenSet();
  }

  init(): Promise<void> {
    return new Promise<void>((resolve) => {
      logger().debug("Init KeyCloak Default registrar");

      const issuer = injector().resolve("oidcIssuerUrl");
      if (!issuer) {
        throw new Error("OIDC issuer URL is not configured.");
      }
      this.issuerUrl = issuer;
      const comps = issuer.split("/");
      this.realm = comps[comps.length - 1];
      if (!this.issuerUrl.endsWith("/")) {
        this.issuerUrl += "/";
      }
      resolve();
    });
  }

  private async refreshAlohaTokenSet() {
    const idp = await injector().resolve("oidcIdentityPropagationService");
    if (idp) {
      await idp.getAlohaTokenSet(true);
    }
  }

  private async getAlohaClientUUID(): Promise<string> {
    const alohaClient = await this.getClientByClientId("aloha");
    if (!alohaClient) {
      throw new Error("Aloha client not found");
    }
    return alohaClient.id!;
  }

  private async addAudienceMapper(clientId: string): Promise<void> {
    const alohaUUID = await this.getAlohaClientUUID();
    await this.callKC(
      `/admin/realms/${this.realm}/clients/${alohaUUID}/protocol-mappers/models`,
      "POST",
      undefined,
      {
        name: `audience-${clientId}`,
        protocol: "openid-connect",
        protocolMapper: "oidc-audience-mapper",
        consentRequired: false,
        config: {
          "included.client.audience": clientId,
          "id.token.claim": "false",
          "access.token.claim": "true",
          "lightweight.claim": "false",
          "introspection.token.claim": "true",
        },
      }
    );
  }

  private async removeAudienceMapper(clientId: string): Promise<void> {
    const alohaUUID = await this.getAlohaClientUUID();
    const mappers = await this.callKC(
      `/admin/realms/${this.realm}/clients/${alohaUUID}/protocol-mappers/models`,
      "GET",
      z.array(z.object({ id: z.string(), name: z.string() }))
    );
    const mapper = mappers.find((m) => m.name === `audience-${clientId}`);
    if (mapper) {
      await this.callKC(
        `/admin/realms/${this.realm}/clients/${alohaUUID}/protocol-mappers/models/${mapper.id}`,
        "DELETE"
      );
    }
  }

  private async getClientByClientId(clientId: string) {
    const allClients = await this.callKC(
      `/admin/realms/${this.realm}/clients`,
      "GET",
      z.array(KCClientRepresentationSchema)
    );
    return allClients.find((e) => e.clientId === clientId);
  }

  private async callKC(
    uri: string,
    method: HTTPVerb,
    schema?: undefined,
    body?: { [k: string]: unknown } | Array<unknown>
  ): Promise<undefined>;
  private async callKC<T>(
    uri: string,
    method: HTTPVerb,
    schema: z.ZodSchema<T>,
    body?: { [k: string]: unknown } | Array<unknown>
  ): Promise<T>;
  private async callKC<T>(
    uri: string,
    method: HTTPVerb,
    schema?: z.ZodSchema<T>,
    body?: { [k: string]: unknown } | Array<unknown>
  ): Promise<T | undefined> {
    const oidcAlohaTokenSetProvider = injector().resolve(
      "oidcAlohaTokenSetProvider"
    );

    if (!oidcAlohaTokenSetProvider) {
      throw new Error("Aloha OIDC token set provider is not configured.");
    }

    const tokenSet = await oidcAlohaTokenSetProvider();
    const url = new URL(uri, this.issuerUrl);
    const strBody = body ? JSON.stringify(body) : undefined;
    const headers = new Headers({
      Authorization: "Bearer " + tokenSet.access_token,
    });
    if (body) {
      headers.set("Content-Type", "application/json");
      // headers.set("Content-Length", "" + strBody!.length);
    }
    const response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: strBody! }),
    });
    if (!response.ok) {
      const responseBody = await response.text();
      logger().error(
        { method, url: url.toString(), status: response.status, responseBody },
        "Failed KeyCloak request"
      );
      throw new Error(
        `Failed KeyCloak request ` +
          method +
          " " +
          url.toString() +
          " " +
          response.status +
          " " +
          responseBody
      );
    }
    if (schema) {
      return schema.parse(await response.json());
    } else {
      return undefined;
    }
  }
}
