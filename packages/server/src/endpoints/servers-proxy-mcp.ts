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

import { authentication_strategy } from "aloha-shared";
import express, { NextFunction, Request, Response } from "express";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { authorise } from "../middleware/authorise";
import { getUserWithIdFromRepository } from "./utils";

import MCPClient from "../connections/mcp-client";
import MCPServer, { prefixNamedItems } from "../connections/mcp-server";
import { createOptionalMCPOidcAuthMiddleware } from "../middleware/oidc/oidc-support";
import { getServer } from "./servers-proxy-utils";

const logger = getLogger("SERVERS-PROXY-MCP");
const mcpManager = () => injector().resolve("mcpManager");

export function serverProxyRoutes() {
  const router = express.Router();

  logger().debug("Registering servers proxy router");

  const optionalOIDCMiddleware = createOptionalMCPOidcAuthMiddleware(
    "SERVERS-PROXY-MCP",
    getUserWithIdFromRepository
  );

  router.use(
    "/hub",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res, next) => {
      const server = await getServer("hub", req, res, MCPServer);
      if (server !== undefined && server.router !== undefined) {
        try {
          const method = req.method;
          if (method === "POST") {
            await server.router.httpPostRequest(req, res, next);
          } else if (method === "GET") {
            await server.router.httpGetRequest(req, res, next);
          } else if (method === "DELETE") {
            await server.router.httpDeleteRequest(req, res, next);
          }
        } catch (e) {
          const log = logger();
          log.error(e);
          res.writeHead(405).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -1099,
                message: "Failed to connect to MCP server",
              },
              id: null,
            })
          );
        }
      }
    }
  );

  router.get(
    "/:path/registry/v1",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res) => {
      const server = await getServer(undefined, req, res, MCPServer);
      if (server) {
        return server.registry(req, res);
      } else {
        logger()
          .child({ path: req.params.path })
          .error("Unable to find MCP server");
        return res.status(404).json({
          error: "Unable to find the MCP server",
        });
      }
    }
  );

  // SSE Route
  router.get(
    "/:path/sse",
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req: Request, res: Response, next: NextFunction) => {
      const { path } = req.params;

      const log = logger().child({ path });
      log.debug("Proxy SSE request");

      const server = await getServer(undefined, req, res, MCPServer);
      if (server !== undefined && server.router !== undefined) {
        try {
          await server.router.sseRequest(req, res, next);
        } catch (e) {
          log.error(e);
          res.writeHead(405).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -1099,
                message: "Failed to connect to MCP server",
              },
              id: null,
            })
          );
        }
      }
    }
  );

  // Messages route
  router.post(
    "/:path/messages",
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req: Request, res: Response, next: NextFunction) => {
      const { path } = req.params;

      const log = logger().child({ path });
      log.debug("Proxy Messages request");

      const server = await getServer(undefined, req, res, MCPServer);
      if (server !== undefined && server.router !== undefined) {
        try {
          await server.router.messageRequest(req, res, next);
        } catch (e) {
          log.error(e);
          res.writeHead(405).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -1099,
                message: "Failed to connect to MCP server",
              },
              id: null,
            })
          );
        }
      }
    }
  );

  router.get(
    "/:path/info",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res) => {
      const { path } = req.params;

      const log = logger().child({ path });
      log.debug("Proxy Info request");

      const server = await getServer(undefined, req, res, MCPServer);
      if (server !== undefined && server.router !== undefined) {
        try {
          res.json(
            server.options.connections
              ?.map((c) => mcpManager().getConnection(c, MCPClient))
              .filter((c) => !!c)
              .map((c) => ({
                name: c.connectionOptions.name,
                description: c.connectionOptions.description,
                tags:
                  "tags" in c.connectionOptions ? c.connectionOptions.tags : [],
                isConnected: c.isConnected,
                resources: c.resources,
                resourceTemplates: c.resourceTemplates,
                prompts: c.prompts,
                tools: prefixNamedItems(c.connectionOptions, c.tools),
                versionNumber:
                  c.connectionOptions.versioningInfo?.versionNumber,
                extras: c.connectionOptions.extras,
              }))
          );
        } catch (e) {
          log.error(e);
          res.writeHead(405).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -1090,
                message: "Failed to retrieve server information",
              },
              id: null,
            })
          );
        }
      }
    }
  );
  // Streamable HTTP Routes
  const internalServerPath = (params: { [k: string]: string }) => {
    return (
      params.serverPath +
      (params.serverMode === "mcp"
        ? ""
        : params.serverMode === "hub"
          ? "_hub"
          : "_unknown_mode")
    );
  };

  router.post(
    "/:serverPath/:serverMode",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res, next) => {
      const path = internalServerPath(req.params);

      const log = logger().child({ path });
      log.debug("Proxy Messages request");

      const server = await getServer(path, req, res, MCPServer);
      if (server !== undefined && server.router !== undefined) {
        try {
          await server.router.httpPostRequest(req, res, next);
        } catch (e) {
          log.error(e);
          res.writeHead(405).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -1099,
                message: "Failed to connect to MCP server",
              },
              id: null,
            })
          );
        }
      }
    }
  );
  router.get(
    "/:serverPath/:serverMode",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res, next) => {
      const path = internalServerPath(req.params);

      const log = logger().child({ path });
      log.debug("Proxy Messages request");

      const server = await getServer(path, req, res, MCPServer);
      if (server !== undefined && server.router !== undefined) {
        try {
          await server.router.httpGetRequest(req, res, next);
        } catch (e) {
          log.error(e);
          res.writeHead(405).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -1099,
                message: "Failed to connect to MCP server",
              },
              id: null,
            })
          );
        }
      }
    }
  );
  router.delete(
    "/:serverPath/:serverMode",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res, next) => {
      const path = internalServerPath(req.params);

      const log = logger().child({ path });
      log.debug("Proxy Messages request");

      const server = await getServer(path, req, res, MCPServer);
      if (server !== undefined && server.router !== undefined) {
        try {
          await server.router.httpDeleteRequest(req, res, next);
        } catch (e) {
          log.error(e);
          res.writeHead(405).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -1099,
                message: "Failed to connect to MCP server",
              },
              id: null,
            })
          );
        }
      }
    }
  );

  return router;
}
