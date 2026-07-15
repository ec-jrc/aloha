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
import * as express from "express";
import { authentication_strategy } from "aloha-shared";
import { A2AServer } from "../connections/a2a-server";
import { assertFieldInObject } from "../utils/type-utils";
import z from "zod";
import { getLogger } from "../injector/provide-logger";
import { injector } from "../injector/injector";
import { AGENT_PROJECT } from "../middleware/jwt-authentication";
import { HTTPError, verifyPermission } from "./utils";
import MCPServer from "../connections/mcp-server";

const logger = getLogger("SERVERS-PROXY-COMMON");
const mcpManager = () => injector().resolve("mcpManager");
const agentRepository = () => injector().resolve("agentRepository");
const agentCache = () => injector().resolve("agentsCache");

export async function getServer(
  path: string | undefined,
  req: express.Request,
  res: express.Response,
  type: typeof A2AServer,
  checkAuth?: boolean
): Promise<A2AServer | undefined>;
export async function getServer(
  path: string | undefined,
  req: express.Request,
  res: express.Response,
  type: typeof MCPServer,
  checkAuth?: boolean
): Promise<MCPServer | undefined>;
export async function getServer(
  path: string | undefined,
  req: express.Request,
  res: express.Response,
  type: typeof A2AServer | typeof MCPServer,
  checkAuth?: boolean
): Promise<A2AServer | MCPServer | undefined> {
  if (path === undefined) {
    assertFieldInObject(req, "path", z.string());
    path = req.params.path;
  }

  const log = logger().child({ path });
  try {
    if (!path) {
      res.writeHead(405).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32602,
            message: "Must provide the server path",
          },
          id: null,
        })
      );
      return undefined;
    }

    const server = mcpManager().getServerByPath(path);

    if (!server || !(server instanceof type)) {
      res.writeHead(405).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Cannot find the server",
          },
          id: null,
        })
      );
      return undefined;
    }

    if (server.options.disabled) {
      res.writeHead(503).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: "Server is disabled and temporarily not available",
          },
          id: null,
        })
      );
      return undefined;
    }

    if (!server.router) {
      res.writeHead(405).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32004,
            message: "Server router is not initialized",
          },
          id: null,
        })
      );
      return undefined;
    }

    if (!checkAuth) {
      return server;
    }

    if (!authentication_strategy.isUserAuthenticated(req)) {
      res.writeHead(500).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32003,
            message: "Missing authentication",
          },
          id: null,
        })
      );
      return undefined;
    }

    if (
      authentication_strategy.isUserAuthenticated(req) &&
      authentication_strategy.getUserFromSession(req).displayName ==
        AGENT_PROJECT
    ) {
      const user = authentication_strategy.getUserFromSession(req);

      const agent = await agentCache().get(user.id, () =>
        agentRepository().findById(user.id)
      );
      if (!agent || agent.serverPath !== path) {
        res.writeHead(403).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32003,
              message: "You are not authorized to perform this operation",
            },
            id: null,
          })
        );
        return undefined;
      }
    } else {
      await verifyPermission(server.options, req, "execute", true);
    }

    return server;
  } catch (e) {
    if (e instanceof HTTPError) {
      res.writeHead(e.errorCode).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -1099,
            message: e.message,
          },
          id: null,
        })
      );
    } else {
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
  return undefined;
}
