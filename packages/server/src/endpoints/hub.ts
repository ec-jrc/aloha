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

import express, { Router, Request, Response } from "express";
import {
  authentication_strategy,
  endpoints_schemas,
  // schemas,
} from "aloha-shared";
import { injector } from "../injector/injector";
import { authorise } from "../middleware/authorise";
import { getLogger } from "../injector/provide-logger";
import { unknownToString } from "../utils/type-utils";
import {
  mcpServerShutdown,
  mcpServerStartup,
} from "../connections/mcp-server-setup";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const logger = getLogger("HUB");
const startDate = new Date();

export function hubRouter() {
  const router: Router = express.Router();

  logger().debug("Registering hub router");

  // Get information of the connected user
  router.get("/", (_req: Request, res: Response) => {
    const mcpManager = injector().resolve("mcpManager");
    const connections = Array.from(mcpManager.getConnections()).filter(
      (c) => c.connectionOptions.type == "client"
    );
    const servers = Array.from(mcpManager.getServers()).filter(
      (c) => c.options.type == "server"
    );
    const agents = Array.from(mcpManager.getConnections()).filter(
      (c) => c.connectionOptions.type == "agent"
    );

    // const agents = injector.resolve("agentRepository").findByPattern({});

    const response = endpoints_schemas.HubStatusSchema.parse({
      startDate,
      manager: {
        startDate: mcpManager.getStartDate(),
      },
      clients: {
        online: connections.filter((e) => e.isConnected).length,
        total: connections.length,
      },
      agents: {
        online: agents.filter((e) => e.isConnected).length,
        total: agents.length,
      },
      servers: {
        online: servers.length,
        total: servers.length,
      },
    });
    res.json(response).end();
  });

  router.post(
    "/restart",
    authorise([authentication_strategy.Permissions.Administration]),
    async (_req, res) => {
      try {
        await mcpServerShutdown();
        await mcpServerStartup();
        res.status(204).end();
      } catch (err) {
        logger().error(err);
        res.status(500).json({ error: unknownToString(err) });
      }
    }
  );

  router.get(
    "/allowed-http-headers-overrides",
    (_req: Request, res: Response) => {
      const allowedHttpHeadersOverrides = injector().resolve(
        "allowedHttpHeadersOverrides"
      );
      const response =
        endpoints_schemas.AllowedHttpHeadersOverridesSchema.parse({
          allowedHttpHeadersOverrides,
        });
      res.json(response).end();
    }
  );

  router.get("/changelog", async (_req, res) => {
    try {
      // Path to the changelog file at the project root
      const changelogPath =
        process.env.CHANGELOG_PATH ||
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../../CHANGELOG.md"
        );

      logger().child({ changelogPath }).debug("Serve changelog");

      // Read the changelog file
      const content = await fs.readFile(changelogPath, "utf-8");

      // Set appropriate headers for markdown file
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.send(content);
    } catch (error) {
      logger().error("Error serving changelog:", error);
      res.status(500).send("Error loading changelog");
    }
  });

  return router;
}
