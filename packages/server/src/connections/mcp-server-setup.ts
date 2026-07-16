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

import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";

const logger = getLogger("MCP-SERVER-SETUP");
const mcpManager = () => injector().resolve("mcpManager");

export async function mcpServerStartup() {
  const manager = mcpManager();
  logger().info("Setting up MCP Hub");
  const connectionsOptionsRepository = injector().resolve(
    "connectionOptionsRepository"
  );
  const serverOptionsRepository = injector().resolve("serverOptionsRepository");
  const agentsRepository = injector().resolve("agentRepository");

  const connectionOptions = await connectionsOptionsRepository.findByPattern(
    {}
  );
  const agents = await agentsRepository.findByPattern({});
  const alohaTokenSet = injector().resolve("oidcAlohaTokenSetProvider");

  logger().info("Create client connections");
  // Create connections to all MCP server connection
  for (const connectionOption of connectionOptions) {
    try {
      manager.createConnection(connectionOption, alohaTokenSet);
    } catch (e) {
      logger().error(e);
    }
  }
  // Create connections to all Agents
  logger().info("Create agents connections");
  for (const agent of agents) {
    try {
      manager.createConnection(agent, alohaTokenSet);
    } catch (e) {
      logger().error(e);
    }
  }

  // Start the ping for all MCP server connection
  logger().info("Start ping service");
  await manager.startPingService();

  const serverOptions = await serverOptionsRepository.findByPattern({});

  logger().info("Create servers");
  // Create a server for every serverOption
  for (const option of serverOptions) {
    manager.createServer(option);
  }

  logger().info("Create server agents");
  for (const agent of agents) {
    manager.createServer(agent);
  }

  logger().info("Create global hub");
  manager.createGlobalHub();
}

export async function mcpServerShutdown() {
  logger().info("Restart server requested");
  const manager = mcpManager();
  const servers = manager.getServers();
  const clients = manager.getConnections();

  logger().info("Closing all servers");
  for (const s of servers) {
    await manager.removeServer(s.id);
  }

  logger().info("Stop ping service");
  manager.stopPingService();

  logger().info("Stop all clients");
  for (const c of clients) {
    await manager.removeConnection(c.id);
  }
}
