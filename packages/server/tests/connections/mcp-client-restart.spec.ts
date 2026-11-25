/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the "Licence");
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/
// [Note: File generated using Generative AI technology]

import { expect } from "chai";
import { schemas } from "aloha-shared";
// Import injector BEFORE MCPClient to avoid circular-dependency issue in CJS:
// mcp-client.ts -> injector.ts -> provide-mcp-manager.ts -> mcp-manager.ts -> mcp-client.ts
import "../../src/injector/injector";
import MCPClient from "../../src/connections/mcp-client";
import MCPManager from "../../src/connections/mcp-manager";
import { NoopMetricsProvider } from "../../src/metrics/noop";
import { promisedStatus } from "../../src/utils/type-utils";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const makeConnectionOpts = (
  overrides: Partial<schemas.MCPBaseConnectionWithId> = {}
): schemas.MCPBaseConnectionWithId => ({
  id: "conn-restart-1",
  name: "Stateful Restart Connection",
  serverUrl: "memory://test",
  serverProtocol: "http",
  type: "client",
  creator: "test",
  visibility: schemas.Visibility.Public,
  ...overrides,
});

/** Create a real MCP Server exposing the given tools, wired via in-memory transport. */
const createServerAndTransport = (
  tools: Array<{
    name: string;
    description: string;
    inputSchema: { type: string; properties: object };
  }>
) => {
  const server = new Server(
    { name: "test-stateful-server", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: [],
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: [],
  }));
  server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: [] }));

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  return { server, clientTransport, serverTransport };
};

/**
 * Wire a real SDK Client (connected to an in-memory server) into the MCPClient
 * and pre-set connectPromise so pingClient()'s connectClient() returns true
 * without trying to build an HTTP transport.
 */
const wireClient = async (
  mcpClient: MCPClient,
  sdkClient: Client,
  clientTransport: InMemoryTransport
) => {
  (mcpClient as any).client = sdkClient;
  await sdkClient.connect(clientTransport as any);
  (mcpClient as any).connectPromise = promisedStatus(
    false,
    Promise.resolve(true)
  );
  // Reset the 30s throttle so each ping() triggers a list refresh
  (mcpClient as any)._lastListRefresh = 0;
};

const closeServerAndTransport = async (
  server: Server,
  clientTransport: InMemoryTransport
) => {
  await server.close();
  await clientTransport.close();
};

describe("MCPClient revision-based staleness after remote restart (fix validation)", () => {
  it("advances revisionVersion and refreshes tools when the stateful server restarts and is re-pinged (no list_changed notification)", async () => {
    // Phase 1: connect + ping once -> tools = [tool-a]
    let { server, clientTransport, serverTransport } = createServerAndTransport(
      [
        {
          name: "tool-a",
          description: "initial tool",
          inputSchema: { type: "object", properties: {} },
        },
      ]
    );
    await server.connect(serverTransport as any);
    const mcpClient = new MCPClient(makeConnectionOpts(), undefined);
    const sdkClient = new Client(
      { name: "test-sdk-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await wireClient(mcpClient, sdkClient, clientTransport);
    await mcpClient.pingClient();
    expect(mcpClient.tools.map((t) => t.name).sort()).to.deep.equal(["tool-a"]);
    // The very first refresh transitions lists from empty to populated, so refreshLists()
    // legitimately bumps the revision once. Record that baseline.
    const baselineRevision = mcpClient.revisionVersion;
    expect(baselineRevision).to.be.greaterThan(0);

    // Phase 2: remote restarts in place, changing tools, sending NO notification.
    // Keep the SAME sdkClient (dedicated per-session client stays alive).
    await closeServerAndTransport(server, clientTransport);
    const second = createServerAndTransport([
      {
        name: "tool-b",
        description: "new tool b",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "tool-c",
        description: "new tool c",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    server = second.server;
    clientTransport = second.clientTransport;
    serverTransport = second.serverTransport;
    await server.connect(serverTransport as any);
    // Rewire the SAME sdkClient to the new transport and reconnect.
    await sdkClient.connect(clientTransport as any);

    // Phase 3: re-ping (this is what getConnectionsForSession triggers when the
    // session client's revisionVersion is behind the manager's main-client revision).
    // Reset the 30s throttle so refreshLists() runs on this re-ping.
    (mcpClient as any)._lastListRefresh = 0;
    await mcpClient.pingClient();
    const after = mcpClient.tools.map((t) => t.name).sort();
    console.log("[TEST] tools after restart + re-ping:", JSON.stringify(after));
    console.log(
      "[TEST] revisionVersion advanced from",
      baselineRevision,
      "to",
      mcpClient.revisionVersion
    );
    expect(after).to.deep.equal(["tool-b", "tool-c"]);
    // The before/after comparison inside refreshLists() must have detected the change and bumped the revision.
    expect(mcpClient.revisionVersion).to.be.greaterThan(baselineRevision);

    await sdkClient.close();
    await server.close();
  });

  it("MCPManager.getConnectionRevision reflects the main client's revisionVersion", async () => {
    const manager = new MCPManager(
      {} as any,
      {} as any,
      new NoopMetricsProvider()
    );
    try {
      // Unknown connection -> 0
      expect(manager.getConnectionRevision("nonexistent")).to.equal(0);

      // Register a main MCPClient connection and set its revision
      const opts = makeConnectionOpts();
      const mainClient = manager.createConnection(opts, undefined) as MCPClient;
      mainClient.revisionVersion = 7;
      expect(manager.getConnectionRevision(opts.id)).to.equal(7);
    } finally {
      manager.stopPingService();
    }
  });
});
