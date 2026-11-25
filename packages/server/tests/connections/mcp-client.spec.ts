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

import { expect } from "chai";
import sinon from "sinon";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { schemas } from "aloha-shared";
// Import injector BEFORE MCPClient to mirror mcp-manager.spec.ts and avoid
// circular-dependency issues in the CJS test environment.
import "../../src/injector/injector";
import MCPClient from "../../src/connections/mcp-client";

const makeConnectionOpts = (
  overrides: Partial<schemas.MCPBaseConnectionWithId> = {}
): schemas.MCPBaseConnectionWithId => ({
  id: "conn-1",
  name: "Test Connection",
  serverUrl: "http://localhost:3000",
  serverProtocol: "http",
  type: "client",
  creator: "test",
  visibility: schemas.Visibility.Public,
  ...overrides,
});

/**
 * Build a fake MCP SDK Client whose transport is a real
 * StreamableHTTPClientTransport carrying a sessionId, so the connection looks
 * stateful. connect() resolves (simulating a prior successful handshake),
 * ping() rejects (server was killed), and terminateSession() rejects the way
 * the SDK does when the DELETE hits a dead server (ECONNREFUSED).
 */
const makeStatefulFakeClient = (opts: {
  pingError: Error;
  terminateError?: Error;
}) => {
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000"),
    { sessionId: "session-abc" }
  );

  const terminateStub = sinon
    .stub(transport, "terminateSession")
    .callsFake(async () => {
      if (opts.terminateError) {
        throw opts.terminateError;
      }
    });
  const transportCloseStub = sinon
    .stub(transport, "close")
    .resolves();

  const client = {
    transport,
    connect: sinon.stub().resolves(),
    ping: sinon.stub().rejects(opts.pingError),
    close: sinon.stub().resolves(),
    getServerCapabilities: sinon.stub().returns({}),
  };

  return { client, transport, terminateStub, transportCloseStub };
};

describe("MCPClient down detection", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("reports isConnected=false after a ping failure on a stateful connection whose terminateSession rejects", async () => {
    const mcpClient = new MCPClient(makeConnectionOpts(), undefined);

    const terminateError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const { client, terminateStub } = makeStatefulFakeClient({
      pingError: new Error("ping failed: ECONNREFUSED"),
      terminateError,
    });

    // Replace the real SDK client with our fake and avoid real network in
    // connectClient() by stubbing transport construction.
    (mcpClient as unknown as { client: unknown }).client = client;
    sinon
      .stub(
        mcpClient as unknown as { constructTransport: () => unknown },
        "constructTransport"
      )
      .returns(client.transport);

    // Establish the "connected" state (connect() resolves).
    const connected = await mcpClient.connectClient();
    expect(connected, "precondition: should be connected").to.equal(true);
    expect(mcpClient.isConnected, "precondition: isConnected true").to.equal(
      true
    );
    expect(mcpClient.isStateful, "precondition: stateful").to.equal(true);

    // Server is killed: pingClient() should fail and tear the connection down.
    let threw = false;
    try {
      await mcpClient.pingClient();
    } catch {
      threw = true;
    }

    expect(threw, "pingClient should propagate the ping failure").to.equal(
      true
    );
    // terminateSession was attempted (and rejected) during teardown...
    expect(terminateStub.called, "terminateSession attempted").to.equal(true);
    // ...but close() must still have reset connectPromise so the manager can
    // detect the server going down.
    expect(
      mcpClient.isConnected,
      "isConnected must be false after a stateful server goes down"
    ).to.equal(false);
  });

  it("reports isConnected=false after a ping failure when terminateSession succeeds", async () => {
    const mcpClient = new MCPClient(makeConnectionOpts({ id: "conn-2" }), undefined);

    const { client } = makeStatefulFakeClient({
      pingError: new Error("ping failed"),
    });

    (mcpClient as unknown as { client: unknown }).client = client;
    sinon
      .stub(
        mcpClient as unknown as { constructTransport: () => unknown },
        "constructTransport"
      )
      .returns(client.transport);

    await mcpClient.connectClient();
    expect(mcpClient.isConnected).to.equal(true);

    try {
      await mcpClient.pingClient();
    } catch {
      /* expected */
    }

    expect(mcpClient.isConnected).to.equal(false);
  });
});
