/*
Copyright (C) 2025 European Union
 
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

import { createInjector } from "typed-inject";
import { provideCaches } from "./provide-caches";
import { provideDatabase } from "./provide-database";
import { provideEnvVars } from "./provide-env-vars";
import { provideLogger } from "./provide-logger-instance";
import { provideMcpManager } from "./provide-mcp-manager";
import { provideMetrics } from "./provide-metrics";
import { provideOIDC } from "./provide-oidc";
import { provideSessionStore } from "./provide-session-store";

import { authentication_strategy, logger, schemas } from "aloha-shared";
import { providePlatformPlugins } from "./provide-platform-plugins";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const unusedRefsRequiredBuTheCompiler = [
  logger,
  schemas,
  authentication_strategy,
];

let defaultInjector = providePlatformPlugins(
  provideMcpManager(
    provideMetrics(
      provideSessionStore(
        provideDatabase(
          provideLogger(
            provideOIDC(provideEnvVars(provideCaches(createInjector())))
          )
        )
      )
    )
  )
).provideValue("test", false);

export type AlohaInjector = typeof defaultInjector;

export function replaceInjector(newInjector: AlohaInjector) {
  defaultInjector = newInjector;
}

export function injector(): AlohaInjector {
  return defaultInjector;
}
