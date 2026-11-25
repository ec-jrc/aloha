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

import "dotenv/config";
import { Injector } from "typed-inject";

export function provideEnvVars<T>(injector: Injector<T>) {
  const isProduction =
    (process.env.NODE_ENV || "development").toLowerCase() === "production";

  const SERVER_SECRET = process.env.SERVER_SECRET;
  if (!SERVER_SECRET) {
    throw new Error(
      "SERVER_SECRET is not defined in the environment variables"
    );
  }

  const CLIENT_SECRET = process.env.CLIENT_SECRET;
  if (!CLIENT_SECRET) {
    throw new Error(
      "CLIENT_SECRET is not defined in the environment variables"
    );
  }

  const SESSION_SECRET = process.env.SESSION_SECRET;
  if (!SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET is not defined in the environment variables"
    );
  }

  const SESSION_MAX_AGE = parseInt(
    process.env.SESSION_MAX_AGE || String(1000 * 60 * 60 * 24),
    10
  );

  const DEFAULT_JWT_AUTHENTICATION =
    process.env.DEFAULT_JWT_AUTHENTICATION || "true";

  const ALLOWED_HTTP_HEADERS_OVERRIDES = (
    process.env.ALLOWED_HTTP_HEADERS_OVERRIDES || ""
  )
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const METRICS_ENABLED = (process.env.METRICS_ENABLED || "true") === "true";
  const METRICS_PREFIX = process.env.METRICS_PREFIX || "aloha_";

  const newInjector = injector
    .provideValue("isProduction", isProduction)
    .provideValue(
      "defaultJWTAuthentication",
      DEFAULT_JWT_AUTHENTICATION === "true"
    )
    .provideValue("allowedHttpHeadersOverrides", ALLOWED_HTTP_HEADERS_OVERRIDES)
    .provideValue("pluginPath", process.env.AUTHENTICATION_PLUGIN)
    .provideValue(
      "platformPluginsNames",
      (process.env.PLATFORM_PLUGINS || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    )
    .provideValue("platformPluginsPath", process.env.PLATFORM_PLUGINS_PATH)
    .provideValue("serverSecret", SERVER_SECRET)
    .provideValue("clientSecret", CLIENT_SECRET)
    .provideValue("sessionSecret", SESSION_SECRET)
    .provideValue("sessionMaxAge", SESSION_MAX_AGE)
    .provideValue("metricsEnabled", METRICS_ENABLED)
    .provideValue("metricsPrefix", METRICS_PREFIX);

  return newInjector;
}
