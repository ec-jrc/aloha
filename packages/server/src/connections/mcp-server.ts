import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
// [SSE-SUPPORT-REMOVED] Deprecated inbound SSE transport disabled; restore together with
// the sseRequest/messageRequest routes below and the @modelcontextprotocol/server-legacy dependency.
// import { SSEServerTransport } from "@modelcontextprotocol/server-legacy/sse";
import {
  AuthInfo,
  Server,
  Tool,
  CallToolRequest,
  CallToolResult,
  isInitializeRequest,
} from "@modelcontextprotocol/server";

/*
Copyright (C) 2025 European Union

Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the “Licence);
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/
import { authentication_strategy, schemas } from "aloha-shared";
import { NextFunction, Request, Response } from "express";
// [SSE-SUPPORT-REMOVED] ServerResponse was only used by the legacy SSE transport.
// import { ServerResponse } from "http";
import MiniSearch, { SearchResult } from "minisearch";
import { randomUUID } from "node:crypto";
import z from "zod";
import { MCPBaseServerWithId } from "../../../aloha-shared/dist/schemas";
import MCPManager from "../connections/mcp-manager";
import { serveRegistry } from "../endpoints/servers-proxy-utils";
import { verifyPermission } from "../endpoints/utils";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { TokenSet, TokenSetProvider } from "../middleware/oidc/oidc-support";
import {
  filterOnlyMCPClient,
  findConnectedConnection,
} from "../utils/connection-utils";
import { A2AClient } from "./a2a-client";
import MCPClient from "./mcp-client";

const logger = getLogger("MCPSERVER");

interface CustomRouter {
  // [SSE-SUPPORT-REMOVED] Legacy SSE router entries; restore with the /sse and /messages routes.
  // sseRequest: (
  //   req: Request,
  //   res: Response,
  //   next: NextFunction
  // ) => Promise<void>;
  // messageRequest: (
  //   req: Request,
  //   res: Response,
  //   next: NextFunction
  // ) => Promise<void>;
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

type CreateSessionServerFunction = (
  options: MCPBaseServerWithId,
  getConnectionsForSession: (
    sessionId: string,
    tokenSet: TokenSetProvider | undefined
  ) => Promise<(MCPClient | A2AClient)[]>
) => Server;

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

const DISCOVER_TOOLS_DEFINITION: Tool = {
  name: "discover_tools",
  description: `Search for tools.

Use this tool to find relevant tools when you need to:
- Find tools by functionality (e.g., "file operations", "database queries")
- Search by technology or domain (e.g., "kubernetes", "aws", "git")

The search examines tool names, descriptions, and parameter information.
Results are ranked by relevance with exact name matches prioritized.

Query tips for best results:
- Use specific keywords: "create file" instead of just "file"
- Use domain terms: "kubernetes deploy" for K8s tools
- Use "*" to list all available tools

Example queries:
- "create file" - finds file creation tools
- "kubernetes deploy" - finds K8s deployment tools
- "send email" - finds email-related tools
- "*" - lists all tools (use with limit for pagination)`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query to match against tool names, descriptions, and parameters. Use '*' to list all tools.",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 5, min:1, max: 100)",
      },
      offset: {
        type: "number",
        description: "Number of results to skip for pagination",
      },
    },
    required: ["query"],
  },
};

const INVOKE_TOOL_DEFINITION: Tool = {
  name: "invoke_tool",
  description: `Execute a tool by its name and parameters.

Use this after discovering tools with discover_tools.

Important: arguments must match the tool's input schema (from discover_tools).`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Fully qualified tool name",
      },
      arguments: {
        type: "object",
        description:
          "Arguments to pass to the tool (must match tool's input schema)",
      },
    },
    required: ["name"],
  },
};

type SearchDoc = {
  id: number;
  mcpClient: MCPClient;
  tool: Tool;
  toolName: string;
  toolDesc: string;
  paramNames: string;
  paramDescs: string;
};

class ServerSession {
  server: Server;
  clients: { [k: string]: MCPClient } = {};
  /**
   * In-flight per-client initializations, keyed by connection id. Used to
   * deduplicate concurrent requests (e.g. the MCP client firing
   * resources/list + tools/list + prompts/list in parallel) so a single
   * dedicated OIDC client is connected and its lists populated once, instead
   * of each request racing to create its own client and returning partial
   * (empty) results.
   */
  pendingClients: { [k: string]: Promise<MCPClient> } = {};
  lastActivity: number = Date.now();

  public constructor(server: Server) {
    this.server = server;
  }

  public get transport() {
    // [SSE-SUPPORT-REMOVED] Union with SSEServerTransport removed; restore when SSE support returns.
    return this.server.transport as NodeStreamableHTTPServerTransport;
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

const InvokeToolRequestSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});
type InvokeToolRequest = z.infer<typeof InvokeToolRequestSchema>;

const DiscoverRequestSchema = z.object({
  query: z.string(),
  limit: z.number().min(1).max(100).default(5),
  offset: z.number().default(0),
});
type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;

const invokeTool = async (
  req: Request,
  request: InvokeToolRequest,
  connections: MCPClient[]
): Promise<CallToolResult> => {
  const clientToCall = connections.find((e) => {
    const prefix = getPrefixForNamedItems(e.connectionOptions);
    if (request.name.startsWith(prefix)) {
      return true;
    }

    return false;
  });
  if (!clientToCall) {
    throw new Error("Unable to find the requested tool");
  }
  const isExecutable = await verifyPermission(
    clientToCall.connectionOptions,
    req,
    "execute"
  );

  if (!isExecutable) {
    throw new Error(`User has no right to call the tool`);
  }

  const toolCall: CallToolRequest = {
    method: "tools/call",
    params: {
      name: request.name.replace(
        getPrefixForNamedItems(clientToCall.connectionOptions),
        ""
      ),
      arguments: request.arguments,
    },
  };
  const result = await clientToCall.sendRequest(toolCall, CallToolResultSchema);
  return result;
};

const discoverTools = async (
  req: Request,
  request: DiscoverRequest,
  connections: MCPClient[]
): Promise<CallToolResult> => {
  const log = logger().child({
    query: request.query,
    limit: request.limit,
    offset: request.offset,
  });

  log.debug("Serving Discover Request");

  const executableConnections = (
    await Promise.all(
      connections.map(async (e) => ({
        connection: e,
        executable: await verifyPermission(e.connectionOptions, req, "execute"),
      }))
    )
  )
    .filter((e) => e.executable)
    .map((e) => e.connection);

  let ids = 0;
  const documents = executableConnections.reduce((p, c) => {
    const docs = c.tools.reduce((tp, tc) => {
      const toolParams = tc.inputSchema?.properties || {};
      const doc: SearchDoc = {
        id: ++ids,
        mcpClient: c,
        tool: tc,
        toolName: tc.name,
        toolDesc: tc.description || "",
        paramNames: Object.keys(toolParams).join(", "),
        paramDescs: Object.keys(toolParams)
          .map((k) => (toolParams[k] as { description?: string }).description)
          .filter((e) => e)
          .join(","),
      };
      tp.push(doc);
      return tp;
    }, [] as SearchDoc[]);
    return p.concat(docs);
  }, [] as SearchDoc[]);

  log
    .child({
      clientIds: documents.map((e) => e.id),
    })
    .debug("Client to search against");

  const minisearch = new MiniSearch({
    fields: ["toolName", "toolDesc", "paramNames", "paramDescs"],
    storeFields: ["mcpClient", "tool"],
  });

  minisearch.addAll(documents);

  const query = request.query.trim();

  const resultsUncapped =
    query === "*"
      ? documents.map(
          (e) =>
            ({
              id: e.id,
              mcpClient: e.mcpClient,
              tool: e.tool,
              score: 100,
            }) as SearchResult & {
              mcpClient: MCPClient;
              tool: Tool;
            }
        )
      : (minisearch.search(query, {
          boost: {
            toolName: 4,
            toolDesc: 3,
            paramNames: 2,
            paramDescs: 1,
          },
          fuzzy: 0.2,
        }) as Array<SearchResult & { mcpClient: MCPClient; tool: Tool }>);

  const results = resultsUncapped.filter((e) => e.score > 1);
  const total = results.length;
  const limit = request.limit;
  const offset = request.offset;

  const result = {
    tools: results.slice(offset, limit).map((e) => ({
      tool: {
        ...e.tool,
        name: prefixNamedItem(e.mcpClient.connectionOptions, e.tool),
      },
      rank: e.score.toFixed(2),
      serverName: e.mcpClient.connectionOptions.name.toLowerCase(),
    })),

    total,
    limit,
    offset,
  };

  log.child({ total, limit, offset }).debug("Result of tool discovery call");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
};

// const discoverToolsGammaSearch = async (
//   req: Request,
//   request: DiscoverRequest,
//   connections: MCPClient[]
// ): Promise<CallToolResult> => {
//   const discoveredTools: {
//     mcpClient: MCPClient;
//     tool: Tool;
//     points: number;
//   }[] = [];
//
//   const log = logger().child({
//     query: request.query,
//     limit: request.limit,
//     offset: request.offset,
//   });
//
//   log.debug("Serving Discover Request");
//
//   const executableConnections = (
//     await Promise.all(
//       connections.map(async (e) => ({
//         connection: e,
//         executable: await verifyPermission(e.connectionOptions, req, "execute"),
//       }))
//     )
//   )
//     .filter((e) => e.executable)
//     .map((e) => e.connection);
//
//   const weights = [100, 90, 70, 60];
//
//   const splitRex = /[\s]+/;
//
//   const normalizedSplit = (str: string) => {
//     return str
//       .trim()
//       .toLowerCase()
//       .split(splitRex)
//       .filter((s) => s.length > 2);
//   };
//
//   const tokens = normalizedSplit(request.query);
//   const requestStar = request.query.trim() === "*";
//
//   executableConnections.forEach((e) => {
//     if (
//       request.serverNames &&
//       request.serverNames.length > 0 &&
//       !request.serverNames
//         .map((v) => v.toLowerCase())
//         .includes(e.connectionOptions.name.toLowerCase())
//     ) {
//       return;
//     }
//
//     e.tools.forEach((t) => {
//       let totalPoints = 0;
//
//       if (requestStar) {
//         discoveredTools.push({
//           mcpClient: e,
//           tool: t,
//           points: weights[0],
//         });
//         return;
//       }
//
//       tokens.forEach((token) => {
//         const points = new Array(weights.length).fill(0);
//
//         points[0] = stringSimilarity(token, t.name);
//
//         if (t.description) {
//           points[1] = Math.max(
//             0,
//             ...normalizedSplit(t.description).map((s) =>
//               stringSimilarity(token, s)
//             )
//           );
//         }
//
//         if (t.inputSchema.properties) {
//           points[2] = Math.max(
//             0,
//             ...Object.keys(t.inputSchema.properties).map((k) => {
//               return stringSimilarity(token, k);
//             })
//           );
//
//           points[3] = Math.max(
//             0,
//             ...Object.keys(t.inputSchema.properties).map((k) => {
//               let propDescPoints = 0;
//               const propDesc = (
//                 t.inputSchema.properties![k] as { description?: string }
//               ).description;
//               if (propDesc) {
//                 propDescPoints = Math.max(
//                   0,
//                   ...normalizedSplit(propDesc).map((s) =>
//                     stringSimilarity(token, s)
//                   )
//                 );
//               }
//               return propDescPoints;
//             })
//           );
//         }
//
//         const finalPoints = weights.reduce((p, c, i) => p + c * points[i], 0);
//         totalPoints += finalPoints;
//       });
//       discoveredTools.push({
//         mcpClient: e,
//         tool: t,
//         points: totalPoints,
//       });
//     });
//   });
//
//   const validDiscoveredTools = discoveredTools.filter(
//     (e) => e.points >= weights[0]
//   );
//
//   validDiscoveredTools.sort(
//     (a, b) => -(a.points > b.points ? 1 : a.points < b.points ? -1 : 0)
//   );
//
//   const total = validDiscoveredTools.length;
//   const limit = request.limit;
//   const offset = request.offset;
//
//   const result = {
//     tools: validDiscoveredTools.slice(offset, limit).map((e) => ({
//       tool: {
//         ...e.tool,
//         name: prefixNamedItem(e.mcpClient.connectionOptions, e.tool),
//       },
//       rank: e.points.toFixed(2),
//       serverName: e.mcpClient.connectionOptions.name.toLowerCase(),
//     })),
//
//     total,
//     limit,
//     offset,
//   };
//
//   log.child({ total, limit, offset }).debug("Result of tool discovery call");
//
//   return {
//     content: [
//       {
//         type: "text",
//         text: JSON.stringify(result, null, 2),
//       },
//     ],
//   };
// };

const createHubSessionServer: CreateSessionServerFunction = (
  options,
  getConnectionsForSession
) => {
  const sessionServer = new Server(
    {
      name: options.name + " (HUB)",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: options.description,
    }
  );

  sessionServer.setRequestHandler("tools/list", (_request, context) => {
    if (!context.sessionId) throw new Error("Must provide a session");

    return {
      tools: [DISCOVER_TOOLS_DEFINITION, INVOKE_TOOL_DEFINITION],
    };
  });

  sessionServer.setRequestHandler("tools/call", async (request, context) => {
    if (!context.sessionId) throw new Error("Must provide a session");

    const connections = await getConnectionsForSession(
      context.sessionId,
      getUserTokenSetProvider(context)
    );
    const mcpConnections = filterOnlyMCPClient(connections);

    const req = {
      ...context.http?.req,
      auth: context.http?.authInfo,
    } as unknown as Request;

    switch (request.params.name) {
      case "discover_tools":
        return await discoverTools(
          req,
          DiscoverRequestSchema.parse(request.params.arguments),
          mcpConnections
        );
      case "invoke_tool":
        return await invokeTool(
          req,
          InvokeToolRequestSchema.parse(request.params.arguments),
          mcpConnections
        );
      default:
        throw new Error("Unknown tool: " + request.params.name);
    }
  });

  return sessionServer;
};

const createStandardSessionServer: CreateSessionServerFunction = (
  options,
  getConnectionsForSession
): Server => {
  const sessionServer = new Server(
    {
      name: options.name,
      version: "1.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
      instructions: options.description,
    }
  );

  sessionServer.setRequestHandler("prompts/list", async (_request, context) => {
    if (!context.sessionId) throw new Error("Must provide a session");

    const connections = await getConnectionsForSession(
      context.sessionId,
      getUserTokenSetProvider(context)
    );
    return {
      prompts: filterOnlyMCPClient(connections)
        .map((c) => prefixNamedItems(c.connectionOptions, c.prompts))
        .flat(),
    };
  });

  sessionServer.setRequestHandler(
    "resources/templates/list",
    async (_request, context) => {
      if (!context.sessionId) throw new Error("Must provide a session");

      const connections = await getConnectionsForSession(
        context.sessionId,
        getUserTokenSetProvider(context)
      );

      return {
        resourceTemplates: filterOnlyMCPClient(connections)
          .map((c) =>
            prefixNamedItems(c.connectionOptions, c.resourceTemplates)
          )
          .flat(),
      };
    }
  );

  sessionServer.setRequestHandler(
    "resources/list",
    async (_request, context) => {
      if (!context.sessionId) throw new Error("Must provide a session");

      const connections = await getConnectionsForSession(
        context.sessionId,
        getUserTokenSetProvider(context)
      );
      return {
        resources: filterOnlyMCPClient(connections)
          .map((c) => prefixNamedItems(c.connectionOptions, c.resources))
          .flat(),
      };
    }
  );

  sessionServer.setRequestHandler(
    "resources/read",
    async (request, context) => {
      if (!context.sessionId) throw new Error("Must provide a session");
      const connections = await getConnectionsForSession(
        context.sessionId,
        getUserTokenSetProvider(context)
      );

      for (const c of filterOnlyMCPClient(connections)) {
        const resource = c.resources.find((t) => t.uri == request.params.uri);
        if (resource) {
          const response = await c.client.readResource(request.params);
          return response;
        }
      }
      throw new Error("Tool not found or server not connected");
    }
  );

  sessionServer.setRequestHandler("tools/list", async (_request, context) => {
    if (!context.sessionId) throw new Error("Must provide a session");

    const connections = await getConnectionsForSession(
      context.sessionId,
      getUserTokenSetProvider(context)
    );
    return {
      tools: filterOnlyMCPClient(connections)
        .map((c) => prefixNamedItems(c.connectionOptions, c.tools))
        .flat(),
    };
  });

  sessionServer.setRequestHandler("tools/call", async (request, context) => {
    if (!context.sessionId) throw new Error("Must provide a session");
    const connections = await getConnectionsForSession(
      context.sessionId,
      getUserTokenSetProvider(context)
    );

    for (const c of filterOnlyMCPClient(connections)) {
      const prefix = getPrefixForNamedItems(c.connectionOptions);

      const tool = c.tools.find((t) => prefix + t.name === request.params.name);
      if (tool) {
        try {
          c.client.setNotificationHandler(
            "notifications/message",
            async (notification) => {
              logger().debug("LoggingMessageNotificationSchema", notification);
              await context.mcpReq.notify(notification);
            }
          );
          c.client.setNotificationHandler(
            "notifications/progress",
            async (notification) => {
              logger().debug("ProgressNotificationSchema", notification);
              await context.mcpReq.notify(notification);
            }
          );
          c.client.fallbackNotificationHandler = async (notification) => {
            logger().debug(notification);
            await context.mcpReq.notify(notification);
          };

          const response = await c.client.callTool(
            {
              ...request.params,
              name: request.params.name.replace(prefix, ""),
            },
            {
              onprogress: (progress) => {
                context.mcpReq
                  .notify({
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
  });

  return sessionServer;
};
class MCPServer {
  options: schemas.MCPBaseServerWithId;
  id: string;
  router: CustomRouter | undefined;
  private mcpManager: MCPManager;
  private reapHandle: ReturnType<typeof setInterval> | null = null;
  private serverSessions: { [k: string]: ServerSession } = {};

  constructor(
    options: schemas.MCPBaseServerWithId,
    private serverMode: "HUB" | "STANDARD"
  ) {
    this.options = options;
    this.id = options.id;
    this.mcpManager = injector().resolve("mcpManager");
  }

  registry(req: Request, res: Response) {
    return serveRegistry(req, res, this);
  }

  // [SSE-SUPPORT-REMOVED] messagesUrl was only used by the legacy SSE transport; parameter kept
  // (underscore-prefixed) so call sites in mcp-manager.ts do not need rework when restoring.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public serve(_messagesUrl: string) {
    if (!this.router) {
      const serverSessions = this.serverSessions;

      const createSessionServer: CreateSessionServerFunction =
        this.serverMode === "STANDARD"
          ? createStandardSessionServer
          : createHubSessionServer;

      const getConnectionsForSession = async (
        sessionId: string,
        tokenSetProvider: TokenSetProvider | undefined,
        forceRefresh: boolean = false
      ): Promise<(MCPClient | A2AClient)[]> => {
        const connections = findConnectedConnection(
          this.mcpManager,
          this.options
        );
        const returnConnections: (MCPClient | A2AClient)[] = [];
        const initPromises: Promise<MCPClient>[] = [];

        const connectedClientsForSession =
          this.serverSessions[sessionId].clients;

        for (const c of connections) {
          if (connectedClientsForSession[c.id]) {
            returnConnections.push(connectedClientsForSession[c.id]);
            continue;
          }

          const needsDedicatedClient =
            tokenSetProvider &&
            c.connectionOptions.authentication?.type === "oidc_client_secret";

          if (!needsDedicatedClient) {
            if (c.connectionOptions.serverProtocol !== "http") {
              returnConnections.push(c);
              continue;
            }
            if (!c.isStateful) {
              returnConnections.push(c);
              continue;
            }
          }

          if (!(sessionId in serverSessions)) {
            throw new Error("There was an error when retrieving the session.");
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

          // Deduplicate concurrent initializations: if another in-flight
          // request is already connecting this client for the session, await
          // the same promise instead of creating a second client. This fixes
          // the race where parallel resources/list + tools/list + prompts/list
          // requests each created their own dedicated OIDC client and returned
          // partial/empty lists.
          if (c.id in serverSessions[sessionId].pendingClients) {
            initPromises.push(serverSessions[sessionId].pendingClients[c.id]);
            continue;
          }

          const client = new MCPClient(
            c.connectionOptions as schemas.MCPBaseConnectionWithId,
            tokenSetProvider
          );
          const initPromise = client
            .connectClient()
            .then(async () => {
              // Populate tools/prompts/resources before the client is used.
              await client.pingClient();
              serverSessions[sessionId].clients[c.id] = client;
              return client;
            })
            .finally(() => {
              delete serverSessions[sessionId].pendingClients[c.id];
            });
          serverSessions[sessionId].pendingClients[c.id] = initPromise;
          initPromises.push(initPromise);
        }

        const initialized = await Promise.all(initPromises);
        return [...returnConnections, ...initialized];
      };

      // Factory function to create a new Server instance per session

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
        // [SSE-SUPPORT-REMOVED] Legacy inbound SSE endpoint; restore together with the /:path/sse and
      // /:path/messages routes in servers-proxy-mcp.ts and the @modelcontextprotocol/server-legacy dependency.
      // sseRequest: async (_req: Request, res: ServerResponse) => {
      //   logger().debug("Received sse connection request");
      //   const transport = new SSEServerTransport(messagesUrl, res);
      //   const sessionServer = createSessionServer(
      //     this.options,
      //     getConnectionsForSession
      //   );
      //   try {
      //     await sessionServer.connect(transport);
      //     // Store session AFTER successful connect
      //     serverSessions[transport.sessionId] = new ServerSession(
      //       sessionServer
      //     );
      //     logger().debug(
      //       { sessionId: transport.sessionId },
      //       "Creating transport"
      //     );
      //     res.on("close", () => {
      //       logger().debug(
      //         { sessionId: transport.sessionId },
      //         "Disconnecting transport"
      //       );
      //       const session = serverSessions[transport.sessionId];
      //       delete serverSessions[transport.sessionId];
      //       session?.close(true).catch((err) => logger().error(err));
      //     });
      //   } catch (error) {
      //     logger().error(error);
      //     // Clean up on failure
      //     await sessionServer.close().catch(() => {});
      //     res.end();
      //   }
      // },
      // messageRequest: async (req, res) => {
      //   const sessionId = req.query.sessionId as string;
      //   const log = logger().child({ sessionId });
      //
      //   log.debug(`Received message`);
      //
      //   try {
      //     if (!sessionId || !serverSessions[sessionId]) {
      //       log.error(`No session found`);
      //       res.status(404).json({
      //         jsonrpc: "2.0",
      //         error: {
      //           code: -32000,
      //           message: `No session found for ` + sessionId,
      //         },
      //         id: null,
      //       });
      //       return;
      //     }
      //     const transport = serverSessions[sessionId].transport;
      //     if (!transport) {
      //       log.error(`No transport found`);
      //       res.status(404).json({
      //         jsonrpc: "2.0",
      //         error: {
      //           code: -32000,
      //           message: `No transport found for session ` + sessionId,
      //         },
      //         id: null,
      //       });
      //       return;
      //     }
      //     if (!(transport instanceof SSEServerTransport)) {
      //       log.error(`Transport type does not match request`);
      //       res.status(404).json({
      //         jsonrpc: "2.0",
      //         error: {
      //           code: -32000,
      //           message:
      //             `Message endpoint called for non SSE transport ` +
      //             sessionId,
      //         },
      //         id: null,
      //       });
      //       return;
      //     }
      //     serverSessions[sessionId].touch();
      //     await transport.handlePostMessage(req, res);
      //   } catch (error) {
      //     log.error(error);
      //     res.status(500).json({
      //       jsonrpc: "2.0",
      //       error: {
      //         code: -32000,
      //         message: "Internal server error",
      //       },
      //       id: null,
      //     });
      //     // res.status(500).json({ error }).end();
      //   }
      // },
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
          let transport: NodeStreamableHTTPServerTransport;
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
                NodeStreamableHTTPServerTransport
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
          } else if (isInitializeRequest(req.body)) {
            // New initialization request
            const sessionServer = createSessionServer(
              this.options,
              getConnectionsForSession
            );
            const newSessionId = randomUUID();
            transport = new NodeStreamableHTTPServerTransport({
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
          injectAuthFieldWithSessionUser(req);
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
          if (!(transport instanceof NodeStreamableHTTPServerTransport)) {
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
          injectAuthFieldWithSessionUser(req);
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
          if (!(transport instanceof NodeStreamableHTTPServerTransport)) {
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

          injectAuthFieldWithSessionUser(req);
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

function injectAuthFieldWithSessionUser(req: Request) {
  if (
    authentication_strategy.isUserAuthenticated(req) &&
    !authentication_strategy.hasRequestAuthInfoField(req)
  ) {
    const user = authentication_strategy.getUserFromSession(req);
    req.auth = {
      token: "token not set",
      clientId: "client id not set",
      scopes: [],
      extra: { user },
    };
  }
}

/**
 * Extracts a bearer access token from an MCP request's Authorization header.
 * Returns undefined when there is no header or it is not a Bearer token.
 */
function extractBearerToken(
  request: globalThis.Request | undefined
): string | undefined {
  const header = request?.headers.get("authorization");
  if (typeof header !== "string") {
    return undefined;
  }
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : undefined;
}

/**
 * Builds a TokenSetProvider for a single MCP request, or `undefined` when no
 * usable end-user token is available.
 *
 * Resolution order (driven by the data present, not by the header alone):
 *  1. A TokenSet already attached to `authInfo.extra.tokenSet` by the auth
 *     middleware -> use it directly.
 *  2. A raw bearer token in the Authorization header -> resolve it live via
 *     the IdentityPropagationService to obtain a reusable TokenSet.
 *  3. Nothing usable -> `undefined`, so callers fall back to the shared,
 *     non-dedicated connection instead of creating a per-user client.
 */
function getUserTokenSetProvider(
  context:
    | { http?: { req?: globalThis.Request; authInfo?: AuthInfo } }
    | undefined
): TokenSetProvider | undefined {
  const attachedTokenSet = context?.http?.authInfo?.extra?.tokenSet as
    | TokenSet
    | undefined;
  if (attachedTokenSet) {
    return () => Promise.resolve(attachedTokenSet);
  }

  const bearerToken = extractBearerToken(context?.http?.req);
  if (bearerToken) {
    return async () => {
      const idps = await injector().resolve("oidcIdentityPropagationService");
      if (!idps) {
        throw new Error(
          "No IdentityPropagationService configured to resolve the bearer token"
        );
      }
      const { tokenSet } = await idps.resolveToken(bearerToken);
      if (!tokenSet) {
        throw new Error("resolveToken did not return a TokenSet");
      }
      return tokenSet;
    };
  }

  return undefined;
}

function getPrefixForNamedItems<U extends { name: string }>(prefix: U) {
  return prefix.name.trim().replaceAll(/\s+/g, "_") + ".";
}

function prefixNamedItem<
  U extends { name: string },
  T extends { name: string },
>(prefix: U, item: T) {
  return getPrefixForNamedItems(prefix) + item.name;
}

export function prefixNamedItems<
  U extends { name: string },
  T extends { name: string },
>(prefix: U, items: T[]) {
  return items.map((e) => ({
    ...e,
    name: getPrefixForNamedItems(prefix) + e.name,
  }));
}
