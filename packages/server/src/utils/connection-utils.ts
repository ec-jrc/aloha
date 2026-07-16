import { A2AClient } from "../connections/a2a-client";
import MCPClient from "../connections/mcp-client";
import MCPManager from "../connections/mcp-manager";
import { RemoteClient } from "../connections/remote-client";

export function findConnectedConnection(
  mcpManager: MCPManager,
  options: { id: string; connections?: string[] },
  includeSelf: boolean = true
) {
  return Array.from(mcpManager.getConnections()).filter(
    (c) =>
      c.isConnected &&
      ((includeSelf &&
        c.connectionOptions.type === "agent" &&
        c.id === options.id) ||
        (options.connections &&
          options.connections.includes(c.connectionOptions.id)))
  );
}

export function filterOnlyA2AClient(clients: RemoteClient[]) {
  return clients.filter((e) => e instanceof A2AClient);
}
export function filterOnlyMCPClient(clients: RemoteClient[]) {
  return clients.filter((e) => e instanceof MCPClient);
}
