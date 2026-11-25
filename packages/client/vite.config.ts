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

import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import checker from "vite-plugin-checker";

function tryParse(number?: string) {
  try {
    if (number) {
      return parseInt(number, 10);
    }
  } catch (e: unknown) {
    console.error(e);
  }
  return 8080;
}

// https://vite.dev/config/
export default defineConfig(() => {
  const env = loadEnv("", process.cwd(), "");

  const runIntegrationTests = env.INTEGRATION_TESTS !== undefined;

  const plugins = [react(), tailwindcss()];

  if (!runIntegrationTests) {
    plugins.push([checker({ typescript: true })]);
  }

  const testToInclude = runIntegrationTests
    ? ["./test/integration-tests/*.spec.ts"]
    : ["./src/**/*.spec.tsx", "./src/**/*.spec.ts"];

  let proxy_url = env.API_URL;
  if (!proxy_url) {
    proxy_url = "http://localhost";
  }

  const url = URL.parse(proxy_url);

  if (!url) {
    throw new Error("Invalid API_URL specified: " + proxy_url);
  }

  if (!url.port) {
    if (env.SERVER_PORT) {
      proxy_url += `:${env.SERVER_PORT}`;
    } else {
      proxy_url += `:3000`;
    }
  }

  return {
    plugins,

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@e2e": path.resolve(__dirname, "./test"),
      },
    },

    server: {
      ...(env.PORT
        ? { port: parseInt(env.PORT, 10) }
        : {
            port: tryParse(env.VITE_SERVER_PORT),
          }),
      proxy: {
        "^/api": {
          target: proxy_url,
        },
        "^/authorize": {
          target: proxy_url,
        },
        "^/token": {
          target: proxy_url,
        },
        "^/revoke": {
          target: proxy_url,
        },
        "^/.well-known": {
          target: proxy_url,
        },
      },
    },

    test: {
      chaiConfig: {
        truncateThreshold: 500,
      },
      globals: true,
      environment: runIntegrationTests ? "node" : "jsdom",
      include: testToInclude,
      coverage: {
        reporter: ["text", "json", "html"],
      },
      reporters: ["verbose"],
      // setupFiles: [],
      ...(runIntegrationTests
        ? {
            hookTimeout: 300000,
            testTimeout: 300000,
          }
        : {}),
    },
  };
});
