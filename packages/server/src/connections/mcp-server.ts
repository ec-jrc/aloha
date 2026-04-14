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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { schemas } from "aloha-shared";
import { NextFunction, Request, Response } from "express";
import { ServerResponse } from "http";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import MCPManager from "../connections/mcp-manager";
import MCPClient from "./mcp-client";
// import http from "http";
// import https from "https";
import * as mcpTypes from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { TokenSetProvider } from "../middleware/oidc/oidc-support";
import { RemoteClient } from "./remote-client";
import { A2AClient } from "./a2a-client";

const logger = getLogger("MCPSERVER");

interface CustomRouter {
  sseRequest: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => Promise<void>;
  messageRequest: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => Promise<void>;
  httpPostRequest: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => Promise<void>;
  httpGetRequest: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => Promise<void>;
  httpDeleteRequest: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => Promise<void>;
}

const readRawBody = (req: Request): Promise<string> => {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
};

const SESSION_TTL_MS = parseInt(
  process.env.MCP_SESSION_TTL_MS || String(30 * 60 * 1000),
  10
);
const SESSION_REAP_INTERVAL_MS = parseInt(
  process.env.MCP_SESSION_REAP_INTERVAL_MS || String(5 * 60 * 1000),
  10
);

class ServerSession {
  server: Server;
  clients: { [k: string]: MCPClient } = {};
  lastActivity: number = Date.now();

  public constructor(server: Server) {
    this.server = server;
  }

  public get transport() {
    return this.server.transport as
      | SSEServerTransport
      | StreamableHTTPServerTransport;
  }

  public touch() {
    this.lastActivity = Date.now();
  }

  public async close(closeTransport: boolean) {
    if (closeTransport) await this.server.transport?.close();
    await this.server.close();
    await Promise.all(
      Object.values(this.clients)
        .filter((c) => c.isStateful) // close only stateful clients, the stateless one are shared
        .map(async (c) => {
          logger().child({ clientId: c.id }).debug("Closing session client");
          await c.close();
        })
    );
  }
}

class MCPServer {
  options: schemas.MCPBaseServerWithId;
  id: string;
  router: CustomRouter | undefined;
  private mcpManager: MCPManager;
  private reapHandle: ReturnType<typeof setInterval> | null = null;
  private serverSessions: { [k: string]: ServerSession } = {};

  constructor(options: schemas.MCPBaseServerWithId) {
    this.options = options;
    this.id = options.id;
    this.mcpManager = injector().resolve("mcpManager");
  }

  public serve(messagesUrl: string) {
    if (!this.router) {
      const serverSessions = this.serverSessions;

      const findConnectedMCPConnection = () =>
        Array.from(this.mcpManager.getConnections()).filter(
          (c) =>
            c.isConnected &&
            ((c.connectionOptions.type === "agent" &&
              c.id === this.options.id) ||
              (this.options.connections &&
                this.options.connections.includes(c.connectionOptions.id)))
        );

      const filterOnlyMCPClient = (clients: RemoteClient[]) => {
        return clients.filter((e) => e instanceof MCPClient);
      };

      const getConnectionsForSession = async (
        sessionId: string,
        tokenSet: TokenSetProvider | undefined,
        forceRefresh: boolean = false
      ): Promise<(MCPClient | A2AClient)[]> => {
        const connections = findConnectedMCPConnection();
        const returnConnections: (MCPClient | A2AClient)[] = [];
        const initPromises: Promise<MCPClient>[] = [];

        const connectedClientsForSession =
          this.serverSessions[sessionId].clients;

        for (const c of connections) {
          if (connectedClientsForSession[c.id]) {
            returnConnections.push(connectedClientsForSession[c.id]);
            continue;
          }
          if (c.connectionOptions.serverProtocol !== "http") {
            returnConnections.push(c);
            continue;
          }
          if (!c.isStateful) {
            returnConnections.push(c);
            continue;
          }
          if (!(sessionId in serverSessions)) {
            throw new Error("There was an error when retriving the session.");
          }
          if (c.id in serverSessions[sessionId].clients) {
            if (forceRefresh) {
              initPromises.push(
                serverSessions[sessionId].clients[c.id]
                  .pingClient()
                  .then(() => serverSessions[sessionId].clients[c.id])
              );
            } else {
              returnConnections.push(serverSessions[sessionId].clients[c.id]);
            }
            continue;
          }

          const client = new MCPClient(
            c.connectionOptions as schemas.MCPBaseConnectionWithId,
            tokenSet
          );
          initPromises.push(
            client.connectClient().then(async () => {
              serverSessions[sessionId].clients[c.id] = client;
              await client.pingClient();
              return client;
            })
          );
        }

        const initialized = await Promise.all(initPromises);
        return [...returnConnections, ...initialized];
      };

      // Factory function to create a new Server instance per session
      const createSessionServer = (): Server => {
        const sessionServer = new Server(
          {
            name: this.options.name,
            version: "1.0.0",
          },
          {
            capabilities: {
              resources: {},
              tools: {},
              prompts: {},
            },
            instructions: this.options.description,
          }
        );

        sessionServer.setRequestHandler(
          ListPromptsRequestSchema,
          async (_request, context) => {
            if (!context.sessionId) throw new Error("Must provide a session");

            const connections = await getConnectionsForSession(
              context.sessionId,
              getUserTokenSet(context.requestInfo)
            );
            return {
              prompts: filterOnlyMCPClient(connections)
                .map((c) => c.prompts)
                .flat(),
            };
          }
        );

        sessionServer.setRequestHandler(
          ListResourceTemplatesRequestSchema,
          async (_request, context) => {
            if (!context.sessionId) throw new Error("Must provide a session");

            const connections = await getConnectionsForSession(
              context.sessionId,
              getUserTokenSet(context.requestInfo)
            );

            return {
              resourceTemplates: filterOnlyMCPClient(connections)
                .map((c) => c.resourceTemplates)
                .flat(),
            };
          }
        );

        sessionServer.setRequestHandler(
          ListResourcesRequestSchema,
          async (_request, context) => {
            if (!context.sessionId) throw new Error("Must provide a session");

            const connections = await getConnectionsForSession(
              context.sessionId,
              getUserTokenSet(context.requestInfo)
            );
            return {
              resources: filterOnlyMCPClient(connections)
                .map((c) => c.resources)
                .flat(),
            };
          }
        );

        sessionServer.setRequestHandler(
          ReadResourceRequestSchema,
          async (request, context) => {
            if (!context.sessionId) throw new Error("Must provide a session");
            const connections = await getConnectionsForSession(
              context.sessionId,
              getUserTokenSet(context.requestInfo)
            );

            for (const c of filterOnlyMCPClient(connections)) {
              const resource = c.resources.find(
                (t) => t.uri == request.params.uri
              );
              if (resource) {
                const response = await c.client.readResource(request.params);
                return response;
              }
            }
            throw new Error("Tool not found or server not connected");
          }
        );

        sessionServer.setRequestHandler(
          ListToolsRequestSchema,
          async (_request, context) => {
            if (!context.sessionId) throw new Error("Must provide a session");

            const connections = await getConnectionsForSession(
              context.sessionId,
              getUserTokenSet(context.requestInfo)
            );
            return {
              tools: filterOnlyMCPClient(connections)
                .map((c) => c.tools)
                .flat(),
            };
          }
        );

        sessionServer.setRequestHandler(
          CallToolRequestSchema,
          async (request, context) => {
            if (!context.sessionId) throw new Error("Must provide a session");
            const connections = await getConnectionsForSession(
              context.sessionId,
              getUserTokenSet(context.requestInfo)
            );

            for (const c of filterOnlyMCPClient(connections)) {
              const tool = c.tools.find((t) => t.name == request.params.name);
              if (tool) {
                try {
                  c.client.setNotificationHandler(
                    LoggingMessageNotificationSchema,
                    async (notification) => {
                      logger().debug(
                        "LoggingMessageNotificationSchema",
                        notification
                      );
                      await context.sendNotification(notification);
                    }
                  );
                  c.client.setNotificationHandler(
                    ProgressNotificationSchema,
                    async (notification) => {
                      logger().debug(
                        "ProgressNotificationSchema",
                        notification
                      );
                      await context.sendNotification(notification);
                    }
                  );
                  c.client.fallbackNotificationHandler = async (
                    notification
                  ) => {
                    logger().debug(notification);
                    await context.sendNotification(notification);
                  };

                  const response = await c.client.callTool(
                    request.params,
                    undefined,
                    {
                      onprogress: (progress) => {
                        context
                          .sendNotification({
                            params: progress,
                            method: "notifications/progress",
                          })
                          .then(() => {})
                          .catch((err) => logger().error(err));
                      },
                    }
                  );
                  return response;
                } finally {
                  c.client.removeNotificationHandler("notifications/message");
                  c.client.removeNotificationHandler("notifications/progress");
                  c.client.fallbackNotificationHandler = undefined;
                }
              }
            }
            throw new Error("Tool not found or server not connected");
          }
        );

        return sessionServer;
      };

      this.reapHandle = setInterval(() => {
        const now = Date.now();
        for (const [key, session] of Object.entries(serverSessions)) {
          if (now - session.lastActivity > SESSION_TTL_MS) {
            logger().debug({ sessionId: key }, "Reaping stale session");
            delete serverSessions[key];
            session.close(true).catch((err) => logger().error(err));
          }
        }
      }, SESSION_REAP_INTERVAL_MS);

      this.router = {
        sseRequest: async (_req: Request, res: ServerResponse) => {
          logger().debug("Received sse connection request");
          const transport = new SSEServerTransport(messagesUrl, res);
          const sessionServer = createSessionServer();
          try {
            await sessionServer.connect(transport);
            // Store session AFTER successful connect
            serverSessions[transport.sessionId] = new ServerSession(
              sessionServer
            );
            logger().debug(
              { sessionId: transport.sessionId },
              "Creating transport"
            );
            res.on("close", () => {
              logger().debug(
                { sessionId: transport.sessionId },
                "Disconnecting transport"
              );
              const session = serverSessions[transport.sessionId];
              delete serverSessions[transport.sessionId];
              session?.close(true).catch((err) => logger().error(err));
            });
          } catch (error) {
            logger().error(error);
            // Clean up on failure
            await sessionServer.close().catch(() => {});
            res.end();
          }
        },
        messageRequest: async (req, res) => {
          const sessionId = req.query.sessionId as string;
          const log = logger().child({ sessionId });

          log.debug(`Received message`);

          try {
            if (!sessionId || !serverSessions[sessionId]) {
              log.error(`No session found`);
              res.status(404).json({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: `No session found for ` + sessionId,
                },
                id: null,
              });
              return;
            }
            const transport = serverSessions[sessionId].transport;
            if (!transport) {
              log.error(`No transport found`);
              res.status(404).json({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: `No transport found for session ` + sessionId,
                },
                id: null,
              });
              return;
            }
            if (!(transport instanceof SSEServerTransport)) {
              log.error(`Transport type does not match request`);
              res.status(404).json({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message:
                    `Message endpoint called for non SSE transport ` +
                    sessionId,
                },
                id: null,
              });
              return;
            }
            serverSessions[sessionId].touch();
            await transport.handlePostMessage(req, res);
          } catch (error) {
            log.error(error);
            res.status(500).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Internal server error",
              },
              id: null,
            });
            // res.status(500).json({ error }).end();
          }
        },
        httpPostRequest: async (req: Request, res) => {
          try {
            const rawBody = await readRawBody(req);
            // console.log(rawBody);
            const contentType = req.headers["content-type"] || "text/plain";

            // Handle JSON if Content-Type is application/json
            if (contentType.includes("application/json")) {
              try {
                const jsonData: unknown = JSON.parse(rawBody);
                // console.log(jsonData);
                req.body = jsonData;
                // res.json({ parsed: jsonData, raw: rawBody });
              } catch (e) {
                logger().error(e);
                res.status(400).json({
                  jsonrpc: "2.0",
                  error: {
                    code: -32000,
                    message: `Invalid request`,
                  },
                  id: null,
                });
                return;
              }
            }
            // Handle plain text
            else {
              res.type("text/plain").send(`Received: ${rawBody}`);
            }
          } catch (err) {
            logger().error(err);
            res.status(500).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Internal server error",
              },
              id: null,
            });
            return;
          }

          // Check for existing session ID
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          let transport: StreamableHTTPServerTransport;
          if (sessionId) {
            // Client provided a session ID
            if (!serverSessions[sessionId]) {
              // Session doesn't exist (expired or invalid)
              res.status(404).json({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: "Session not found or expired",
                },
                id: null,
              });
              return;
            }
            if (
              !(
                serverSessions[sessionId].transport instanceof
                StreamableHTTPServerTransport
              )
            ) {
              // Session exists but wrong transport type
              res.status(400).json({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: "Session transport type mismatch",
                },
                id: null,
              });
              return;
            }
            // Reuse existing transport
            serverSessions[sessionId].touch();
            transport = serverSessions[sessionId].transport;
          } else if (mcpTypes.isInitializeRequest(req.body)) {
            // New initialization request
            const sessionServer = createSessionServer();
            const newSessionId = randomUUID();
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => newSessionId,
              onsessioninitialized: (initializedSessionId) => {
                logger().debug(
                  { sessionId: initializedSessionId },
                  "Session initialized"
                );
                // Store the session when SDK confirms initialization
                serverSessions[initializedSessionId] = new ServerSession(
                  sessionServer
                );
              },
            });
            // Clean up transport when closed
            transport.onclose = () => {
              if (transport.sessionId && serverSessions[transport.sessionId]) {
                serverSessions[transport.sessionId]
                  .close(false)
                  .then(() => {})
                  .catch((err) => logger().error(err));
                delete serverSessions[transport.sessionId];
              }
            };
            try {
              // Connect to the MCP server
              await sessionServer.connect(transport);
            } catch (connectError) {
              logger().error(connectError);
              await sessionServer.close().catch(() => {});
              res.status(500).json({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: "Failed to initialize session",
                },
                id: null,
              });
              return;
            }
          } else {
            // Invalid request
            res.status(400).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Bad Request: No valid session ID provided",
              },
              id: null,
            });
            return;
          }
          // Handle the request
          await transport.handleRequest(req, res, req.body);
        },
        httpGetRequest: async (req, res) => {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (!sessionId || !serverSessions[sessionId]) {
            res.status(400).send("Invalid or missing session ID");
            return;
          }
          const log = logger().child({ sessionId });

          const transport = serverSessions[sessionId].transport;
          if (!(transport instanceof StreamableHTTPServerTransport)) {
            log.error(`Transport type does not match request`);
            res
              .status(405)
              .json({
                error:
                  `MCP endpoint called for non Streamable HTTP transport ` +
                  sessionId,
              })
              .end();
            return;
          }

          serverSessions[sessionId].touch();
          await transport.handleRequest(req, res);
        },
        httpDeleteRequest: async (req, res) => {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (!sessionId || !serverSessions[sessionId]) {
            res.status(400).send("Invalid or missing session ID");
            return;
          }
          const log = logger().child({ sessionId });

          const session = serverSessions[sessionId];
          const transport = session.transport;
          if (!(transport instanceof StreamableHTTPServerTransport)) {
            log.error(`Transport type does not match request`);
            res
              .status(405)
              .json({
                error:
                  `MCP endpoint called for non Streamable HTTP transport ` +
                  sessionId,
              })
              .end();
            return;
          }

          // Delete session BEFORE handleRequest to prevent double cleanup from onclose
          delete serverSessions[sessionId];

          await transport.handleRequest(req, res);
          // Close the session (which closes server and clients)
          await session.close(true).catch((err) => logger().error(err));
        },
      };
    }

    return this.router;
  }

  public async close() {
    if (this.reapHandle) {
      clearInterval(this.reapHandle);
      this.reapHandle = null;
    }
    for (const [key, session] of Object.entries(this.serverSessions)) {
      try {
        delete this.serverSessions[key];
        await session.close(true);
      } catch (error) {
        logger().error(error);
      }
    }
  }
}

export default MCPServer;

function getUserTokenSet(
  requestInfo: mcpTypes.RequestInfo | undefined
): TokenSetProvider {
  if (requestInfo) {
    const authorization = requestInfo.headers["authorization"] as string;
    if (authorization) {
      const parts = authorization.split(" ");
      return () =>
        Promise.resolve({
          access_token: parts[1] || "",
        });
    }
  }

  return () =>
    Promise.resolve({
      access_token: "",
    });
}
