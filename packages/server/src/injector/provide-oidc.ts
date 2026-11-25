/* Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the “Licence”);
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/

import "dotenv/config";
import { Injector } from "typed-inject";
import { IdentityPropagationService } from "../middleware/oidc/identity-propagation-service";
import { KeycloakIdentityPropagationService } from "../middleware/oidc/keycloak-identity-propagation-service";
import { TokenSetProvider } from "../middleware/oidc/oidc-support";
import { authentication_strategy } from "aloha-shared";
import z from "zod";
import { IdentityPropagationServiceRegistrar } from "../middleware/oidc/identity-propagation-service-registrar";
import { KeyCloakIdentityPropagationServiceDefaultRegistrar } from "../middleware/oidc/keycloak-identity-propagation-service-default-registrar";

const PermissionsArraySchema = z.array(
  authentication_strategy.PermissionsSchema
);

export type OidcInjector = {
  oidcEnabled: boolean;
  oidcIssuerUrl: string | undefined;
  oidcClientId: string | undefined;
  oidcJWKS: string | undefined;
  oidcCodeRedirectUri: string | undefined;
  oidcScope: string;
  oidcAudience: string | undefined;
  oidcHome: string;
  oidcIdentityPropagationRegistrar:
    | Promise<IdentityPropagationServiceRegistrar>
    | undefined;
  oidcIdentityPropagationService:
    | Promise<IdentityPropagationService>
    | undefined;
  oidcUseIdentityPropagationService: boolean;
  oidcAlohaTokenSetProvider: TokenSetProvider | undefined;
  oidcUnknownUsersAllow: boolean;
  oidcUnknownUsersPermissions: authentication_strategy.Permissions[];
};

export function provideOIDC<T extends { isProduction: boolean }>(
  injector: Injector<T>
): Injector<T & OidcInjector> {
  const isProduction = injector.resolve("isProduction");

  const OIDC_ENABLED = process.env.OIDC_ENABLED || "false";
  const OIDC_ISSUER_URL = process.env.OIDC_ISSUER_URL;
  const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
  const OIDC_JWKS = process.env.OIDC_JWKS;
  const OIDC_CODE_REDIRECT_URI = process.env.OIDC_CODE_REDIRECT_URI;
  const OIDC_SCOPE = process.env.OIDC_SCOPE || "openid email profile";
  const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE || OIDC_CLIENT_ID;
  const OIDC_HOME = isProduction
    ? "/"
    : process.env.OIDC_HOME || "http://localhost:5173/";

  const OIDC_IDENTITY_PROPAGATION_SERVICE_PATH =
    process.env.OIDC_IDENTITY_PROPAGATION_SERVICE_PATH;

  const oidcUseIdentityPropagationService =
    process.env.OIDC_USE_IDENTITY_PROPAGATION_SERVICE === "true" ||
    !!OIDC_IDENTITY_PROPAGATION_SERVICE_PATH;

  const OIDC_IDENTITY_PROPAGATION_REGISTRAR_PATH =
    process.env.OIDC_IDENTITY_PROPAGATION_REGISTRAR_PATH;

  const oidcRegistrarEnabled =
    process.env.OIDC_USE_IDENTITY_PROPAGATION_REGISTRAR !== "false";

  let oidcIDPRegistrar:
    | Promise<IdentityPropagationServiceRegistrar>
    | undefined;

  if (oidcUseIdentityPropagationService && oidcRegistrarEnabled) {
    if (OIDC_IDENTITY_PROPAGATION_REGISTRAR_PATH) {
      const importModule = import(
        OIDC_IDENTITY_PROPAGATION_REGISTRAR_PATH
      ) as Promise<{
        default: IdentityPropagationServiceRegistrar;
      }>;

      oidcIDPRegistrar = importModule.then((plugin) => plugin.default);
    } else {
      oidcIDPRegistrar = Promise.resolve(
        new KeyCloakIdentityPropagationServiceDefaultRegistrar()
      );
    }
    oidcIDPRegistrar = oidcIDPRegistrar.then((registrar) =>
      registrar.init().then(() => registrar)
    );
  }

  let oidcIDPSService: Promise<IdentityPropagationService> | undefined;

  if (OIDC_IDENTITY_PROPAGATION_SERVICE_PATH) {
    const importModule = import(
      OIDC_IDENTITY_PROPAGATION_SERVICE_PATH
    ) as Promise<{
      default: IdentityPropagationService;
    }>;

    oidcIDPSService = importModule.then((plugin) => plugin.default);
  }

  if (oidcUseIdentityPropagationService && !oidcIDPSService) {
    oidcIDPSService = Promise.resolve(new KeycloakIdentityPropagationService());
  }

  if (oidcIDPSService) {
    oidcIDPSService = oidcIDPSService.then((service) =>
      service.init().then(() => service)
    );
  }

  const tokenSetProvider: TokenSetProvider | undefined = oidcIDPSService
    ? async () => {
        const service = await oidcIDPSService;
        return service.getAlohaTokenSet();
      }
    : undefined;

  const OIDC_UNKNOWN_USERS_ALLOW =
    process.env.OIDC_UNKNOWN_USERS_ALLOW === "true" || false;

  const OIDC_UNKNOWN_USERS_PERMISSIONS: authentication_strategy.Permissions[] =
    PermissionsArraySchema.parse(
      (process.env.OIDC_UNKNOWN_USERS_PERMISSIONS || "")
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length !== 0)
    );

  const newInjector: Injector<OidcInjector> = injector
    .provideValue("oidcEnabled", OIDC_ENABLED === "true")
    .provideValue("oidcIssuerUrl", OIDC_ISSUER_URL)
    .provideValue("oidcClientId", OIDC_CLIENT_ID)
    .provideValue("oidcJWKS", OIDC_JWKS)
    .provideValue("oidcCodeRedirectUri", OIDC_CODE_REDIRECT_URI)
    .provideValue("oidcScope", OIDC_SCOPE)
    .provideValue("oidcAudience", OIDC_AUDIENCE)
    .provideValue("oidcHome", OIDC_HOME)
    .provideValue("oidcAlohaTokenSetProvider", tokenSetProvider)
    .provideValue("oidcIdentityPropagationRegistrar", oidcIDPRegistrar)
    .provideValue(
      "oidcUseIdentityPropagationService",
      oidcUseIdentityPropagationService
    )
    .provideValue("oidcUnknownUsersAllow", OIDC_UNKNOWN_USERS_ALLOW)
    .provideValue("oidcUnknownUsersPermissions", OIDC_UNKNOWN_USERS_PERMISSIONS)
    .provideValue("oidcIdentityPropagationService", oidcIDPSService);

  return newInjector as Injector<T & OidcInjector>;
}
