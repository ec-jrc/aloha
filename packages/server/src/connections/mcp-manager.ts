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

import { schemas } from "aloha-shared";
import { MCPServerOptionsWithId } from "../../../aloha-shared/dist-module/schemas";
import { AgentRepository } from "../database/repositories/interfaces/agent-repository-interface";
import { ConnectionOptionsRepository } from "../database/repositories/interfaces/connection-options-repository";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { TokenSetProvider } from "../middleware/oidc/oidc-support";
import { isA2AAgent } from "../utils/a2a-utils";
import { A2AClient } from "./a2a-client";
import { A2AServer } from "./a2a-server";
import MCPClient from "./mcp-client";
import MCPServer from "./mcp-server";

const logger = getLogger("MCP-MANAGER");
const MAX_AUTOCLOSE_CLIENT_TTL = 15 * 60 * 1000;

class MCPManager {
  public static inject = [
    "connectionOptionsRepository",
    "agentRepository",
  ] as const;
  private connections: Map<string, MCPClient | A2AClient> = new Map();
  private servers: Map<string, MCPServer | A2AServer> = new Map();
  private serversByPath: Map<string, MCPServer | A2AServer> = new Map();
  private startDate: Date | null = null;
  private pingHandle: ReturnType<typeof setInterval> | null = null;
  private previousConnectedState: Map<string, boolean> = new Map();
  private autoCloseClients: {
    [id: string]: { client: MCPClient; timestamp: number; instanceId: string };
  } = {};

  public constructor(
    private connectionOptionsRepository: ConnectionOptionsRepository,
    private agentRepository: AgentRepository
  ) {
    setInterval(() => {
      void this.closeAutoCloseClients();
    }, 60 * 1000);
  }
  public getStartDate() {
    return this.startDate;
  }

  getConnection(id: string): A2AClient | MCPClient | undefined;
  getConnection(id: string, type: typeof A2AClient): A2AClient | undefined;
  getConnection(id: string, type: typeof MCPClient): MCPClient | undefined;
  getConnection(
    id: string,
    type?: typeof MCPClient | typeof A2AClient
  ): MCPClient | A2AClient | undefined {
    const result = this.connections.get(id);

    if (!result) {
      return undefined;
    }

    if (!type) {
      return result;
    }

    if (result instanceof type) {
      return result;
    }

    return undefined;
  }

  getConnections() {
    return this.connections.values();
  }

  createConnection(
    serverOptions: schemas.MCPBaseConnectionWithId | schemas.AgentWithId,
    tokenSetProvider: TokenSetProvider | undefined
  ): MCPClient | A2AClient {
    const serverOptionsId = serverOptions.id;

    const log = logger().child({ serverOptionsId: serverOptionsId });

    let connection = this.connections.get(serverOptionsId);
    if (!connection) {
      log.debug("Creating new MCP connection handler");
      if (isA2AAgent(serverOptions)) {
        connection = new A2AClient(serverOptions, tokenSetProvider);
      } else {
        connection = new MCPClient(
          serverOptions as schemas.MCPBaseConnectionWithId,
          tokenSetProvider
        );
      }
      this.connections.set(serverOptionsId, connection);
    }
    return connection;
  }

  async removeConnection(id: string) {
    const log = logger().child({ connectionId: id });
    log.debug("Removing connection");
    const connection = this.connections.get(id);
    if (connection) {
      await connection.close();
    }

    this.connections.delete(id);
    this.previousConnectedState.delete(id);
  }

  async startPingService() {
    const log = logger();
    log.info("Start ping services");

    // Seed previousConnectedState from DB timestamps
    for (const connection of this.connections.values()) {
      const repo =
        connection instanceof A2AClient
          ? this.agentRepository
          : this.connectionOptionsRepository;
      try {
        const record = await repo.findById(connection.id);
        if (record) {
          const lastOnline = record.lastOnlineAt?.getTime() ?? 0;
          const lastOffline = record.lastOfflineAt?.getTime() ?? 0;
          if (lastOnline || lastOffline) {
            this.previousConnectedState.set(
              connection.id,
              lastOnline > lastOffline
            );
          }
        }
      } catch (e) {
        logger()
          .child({ connectionId: connection.id })
          .debug(e, "Could not seed uptime state from DB");
      }
    }

    const pingFunction = async () => {
      if (this.connections.size === 0) return;
      const onlineServers = Array.from(this.connections.values()).reduce(
        (p, c) => p + (c.isConnected ? 1 : 0),
        0
      );

      await Promise.all(
        Array.from(this.connections.values()).map(async (connection) => {
          try {
            await connection.pingClient();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            // logger().error(e);
          }
        })
      );

      // Detect state transitions and persist timestamps
      for (const connection of this.connections.values()) {
        const id = connection.id;
        const wasConnected = this.previousConnectedState.get(id);
        const isNowConnected = connection.isConnected;

        if (wasConnected !== isNowConnected) {
          const repo =
            connection instanceof A2AClient
              ? this.agentRepository
              : this.connectionOptionsRepository;
          const update = isNowConnected
            ? { lastOnlineAt: new Date() }
            : { lastOfflineAt: new Date() };
          try {
            await repo.updateById(id, update);
          } catch (e) {
            logger()
              .child({ connectionId: id })
              .error(e, "Failed to persist uptime timestamp");
          }
          this.previousConnectedState.set(id, isNowConnected);
        }
      }

      const connectedServers = Array.from(this.connections.values()).reduce(
        (p, c) => p + (c.isConnected ? 1 : 0),
        0
      );

      if (onlineServers !== connectedServers) {
        logger().debug(
          {
            onlineServers: connectedServers,
            totalServers: this.connections.size,
          },
          `MCP servers online`
        );
      }
    };
    await pingFunction();
    this.pingHandle = setInterval(() => void pingFunction(), 5000);
    this.startDate = new Date();
  }

  public stopPingService() {
    if (this.pingHandle !== null) {
      clearInterval(this.pingHandle);
    }
    this.pingHandle = null;
    this.startDate = null;
  }

  async testConnection(id: string) {
    const log = logger().child({ connectionId: id });
    log.debug("Testing connection");
    const connection = this.connections.get(id);
    if (connection) {
      try {
        await connection.pingClient();
        return true;
      } catch (e) {
        logger().error(e);
        return false;
      }
    }
    return false;
  }

  getServer(id: string) {
    return this.servers.get(id);
  }
  getServerByPath(path: string) {
    return this.serversByPath.get(path);
  }
  getServers() {
    return this.servers.values();
  }

  createServer(
    serverOptions: schemas.MCPBaseServerWithId | schemas.AgentWithId
  ): MCPServer | A2AServer {
    const serverOptionsId: string = serverOptions.id;
    const log = logger().child({
      serverId: serverOptionsId,
      serverOptions,
    });
    const server = this.servers.get(serverOptionsId);

    if (!server) {
      if (serverOptions.visibility === schemas.Visibility.Private) {
        // Handle private visibility logic here
        logger().debug(`Creating private server: ${serverOptions.serverPath}`);
      } else if (serverOptions.visibility === schemas.Visibility.Public) {
        // Handle public visibility logic here
        logger().debug(`Creating public server: ${serverOptions.serverPath}`);
      } else if (serverOptions.visibility === schemas.Visibility.Managed) {
        // Handle managed visibility logic here
        logger().debug(`Creating managed server: ${serverOptions.serverPath}`);
      }

      let server: MCPServer | A2AServer;

      let basePathToServe: string;

      if (isA2AAgent(serverOptions)) {
        server = new A2AServer(serverOptions);
        basePathToServe = `/api/a2a/${serverOptions.serverPath}`;
        log.debug({ basePathToServe }, "Serving A2A requests");
      } else {
        server = new MCPServer(serverOptions, "STANDARD");
        // [SSE-SUPPORT-REMOVED] Was `/api/mcp/${...}/messages` for the legacy SSE transport;
        // the path is now only a session key for the Streamable HTTP transport.
        basePathToServe = `/api/mcp/${serverOptions.serverPath}/mcp`;
        log.debug({ basePathToServe }, "Serving messages");

        log.debug("Serving hub");
        const serverHub = new MCPServer(serverOptions, "HUB");
        serverHub.serve(basePathToServe + "_hub");
        this.servers.set(serverOptionsId + "@hub", serverHub);
        this.serversByPath.set(serverOptions.serverPath + "_hub", serverHub);
      }

      server.serve(basePathToServe);
      this.servers.set(serverOptionsId, server);
      this.serversByPath.set(serverOptions.serverPath, server);
      return server;
    }
    return server;
  }

  async removeServer(id: string) {
    const server = this.servers.get(id);
    if (server) {
      const log = logger().child({ serverId: id });
      log.debug("Removing server");
      this.serversByPath.delete(server.options.serverPath);
      await server.close();
    }

    this.servers.delete(id);
  }

  async reloadServer(connectionDefinition: schemas.MCPBaseServerWithId) {
    const log = logger().child({ connectionId: connectionDefinition.id });

    log.debug("Reloading server definition");

    await this.removeServer(connectionDefinition.id);
    this.createServer(connectionDefinition);
  }

  async reloadConnection(
    connectionDefinition: schemas.MCPBaseConnectionWithId | schemas.AgentWithId
  ) {
    const log = logger().child({ connectionId: connectionDefinition.id });

    log.debug("Reloading client definition");

    const prevConnection = this.getConnection(connectionDefinition.id);

    await this.removeConnection(connectionDefinition.id);

    const tokenSetProvider = prevConnection
      ? prevConnection.tokenSetProvider
      : injector().resolve("oidcAlohaTokenSetProvider");

    const connection = this.createConnection(
      connectionDefinition,
      tokenSetProvider
    );
    await connection.connectClient();
  }

  cacheAutoCloseClient(instanceId: string, autoCloseClient: MCPClient) {
    if (!instanceId) {
      throw new Error(`Unable to store temp client without a sessionId`);
    }
    this.autoCloseClients[instanceId] = {
      client: autoCloseClient,
      timestamp: Date.now(),
      instanceId,
    };
  }

  getAutoCloseClient(id: string): MCPClient | undefined {
    return this.autoCloseClients[id]?.client;
  }

  public createGlobalHub() {
    const log = logger();
    const globalHub = this.allocateGlobalHub();
    log
      .child({ serverPath: globalHub.options.serverPath })
      .debug("Creating global hub server");
    // [SSE-SUPPORT-REMOVED] Was "/api/mcp/hub/messages" for the legacy SSE transport.
    globalHub.serve("/api/mcp/hub/mcp");
    this.servers.set(globalHub.id, globalHub);
    this.serversByPath.set(globalHub.options.serverPath, globalHub);
  }

  filterByLatestVersion(items: MCPClient[]) {
    return Object.values(
      items.reduce(
        (p, c) => {
          const versioningInfo = c.connectionOptions.versioningInfo;
          const id = versioningInfo?.versionGroupingUUID || c.id;

          if (p[id]) {
            const savedVersion =
              p[id].connectionOptions.versioningInfo?.versionNumber || 0;

            const currentVersion = versioningInfo?.versionNumber || 0;

            if (savedVersion < currentVersion) {
              p[id] = c;
            }
          } else {
            p[id] = c;
          }
          return p;
        },
        {} as {
          [k: string]: MCPClient;
        }
      )
    );
  }

  private allocateGlobalHub(): MCPServer {
    const allMcpClients = this.filterByLatestVersion(
      Array.from(this.connections.values()).filter(
        (e) => e instanceof MCPClient
      )
    ).map((e) => e.connectionOptions.id);

    const serverOption: MCPServerOptionsWithId = {
      id: "hub",
      creator: "",
      visibility: schemas.Visibility.Public,
      name: "Aloha Global MCP",
      serverPath: "hub",
      type: "server",
      description:
        "MCP Server to use to discover and invoke all the available other MCP Server provided by Aloha",
      connections: allMcpClients,
    };

    logger()
      .child({
        serverOption,
      })
      .debug("HUB Server configuration");

    return new MCPServer(serverOption, "HUB");
  }
  private async closeAutoCloseClients() {
    const now = Date.now();

    const clientsToClose = Object.entries(this.autoCloseClients)
      .map(([key, e]) => {
        if (now - e.timestamp > MAX_AUTOCLOSE_CLIENT_TTL) {
          delete this.autoCloseClients[key];
          return e.client;
        } else {
          return undefined;
        }
      })
      .filter((e) => e !== undefined);

    await Promise.all(
      clientsToClose.map(async (e) => {
        try {
          logger().child({ clientId: e.id }).debug(`Autoclose client`);
          await e.close();
        } catch (err) {
          logger()
            .child({ clientId: e.id })
            .error(`Unable to close the client`, err);
        }
      })
    );
  }
}

export default MCPManager;
