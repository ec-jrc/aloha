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
import { expressSetup } from "./endpoints/express-setup";
import { mcpServerStartup } from "./connections/mcp-server-setup";
import { initMetricsProvider } from "./metrics/init-telemetry";

import { EventSource } from "eventsource";
import { createFetch } from "node-fetch-native/proxy";
import { getLogger } from "./injector/provide-logger";
import { initPlatformPlugins } from "./plugins/plugins-setup";

class EventSourceCustom extends EventSource {
  get readyState(): 0 | 1 | 2 {
    if (
      super.readyState == 0 ||
      super.readyState == 1 ||
      super.readyState == 2
    ) {
      return super.readyState;
    }
    return 0;
  }
}

global.EventSource = EventSourceCustom;

// const noProxyUrls = (process.env.no_proxy || process.env.NO_PROXY || "")
//   .split(",")
//   .map((e) => e.trim())
//   .filter((e) => e.length > 0)
//   .map((url) => (url.match(/^\d/) ? url : `.${url}`));

global.fetch = createFetch();

// Initialize the metrics provider before anything that records
// observations — notably mcpServerStartup()'s first ping cycle, which
// otherwise runs before Express (and the /metrics route) is set up,
// silently dropping every observation from server startup.
initMetricsProvider();

await initPlatformPlugins();
// Setup the MCP servers
await mcpServerStartup();

const logger = getLogger("SERVER");

const port = process.env.SERVER_PORT || 3000;
expressSetup()
  .then((app) => {
    app.listen(port, () => {
      logger().info(`ALOHA is running on port ${port}`);
    });
  })
  .catch((error) => {
    logger().error(error, "Failed to initialize ALOHA");
    process.exit(1);
  });
