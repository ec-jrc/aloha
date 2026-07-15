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
import sinon from "sinon";
import { schemas } from "aloha-shared";
// Import injector BEFORE MCPManager to avoid circular-dependency issue in CJS:
// mcp-manager.ts → injector.ts → provide-mcp-manager.ts → mcp-manager.ts
// Without this, MCPManager is undefined when typed-inject captures it.
import "../../src/injector/injector";
import MCPManager from "../../src/connections/mcp-manager";
import MCPClient from "../../src/connections/mcp-client";
import { A2AClient } from "../../src/connections/a2a-client";

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

/** Minimal fake that satisfies the server interface used by MCPManager */
const makeFakeServer = (opts: { id: string; serverPath: string }) => ({
  id: opts.id,
  options: { serverPath: opts.serverPath } as schemas.MCPBaseServerWithId,
  serve: sinon.stub(),
  close: sinon.stub().resolves(),
});

describe("MCPManager", () => {
  let manager: MCPManager;
  const mockRepo = {} as any;
  const mockAgentRepo = {} as any;

  beforeEach(() => {
    manager = new MCPManager(mockRepo, mockAgentRepo);
  });

  afterEach(() => {
    manager.stopPingService();
    sinon.restore();
  });

  describe("getStartDate", () => {
    it("should return null before ping service starts", () => {
      expect(manager.getStartDate()).to.be.null;
    });
  });

  describe("createConnection / getConnection / getConnections", () => {
    it("should create an MCPClient for non-A2A options", () => {
      const conn = manager.createConnection(makeConnectionOpts(), undefined);
      expect(conn).to.be.instanceOf(MCPClient);
      expect(manager.getConnection("conn-1")).to.equal(conn);
    });

    it("should return existing connection on duplicate id", () => {
      const first = manager.createConnection(makeConnectionOpts(), undefined);
      const second = manager.createConnection(makeConnectionOpts(), undefined);
      expect(first).to.equal(second);
    });

    it("should filter by type when requested", () => {
      manager.createConnection(makeConnectionOpts(), undefined);
      expect(manager.getConnection("conn-1", MCPClient)).to.exist;
      expect(manager.getConnection("conn-1", A2AClient)).to.be.undefined;
    });

    it("should return undefined for unknown id", () => {
      expect(manager.getConnection("nope")).to.be.undefined;
    });

    it("should iterate all connections", () => {
      manager.createConnection(makeConnectionOpts({ id: "a" }), undefined);
      manager.createConnection(makeConnectionOpts({ id: "b" }), undefined);
      const ids = Array.from(manager.getConnections()).map((c) => c.id);
      expect(ids).to.have.members(["a", "b"]);
    });
  });

  describe("removeConnection", () => {
    it("should close and delete the connection", async () => {
      const conn = manager.createConnection(makeConnectionOpts(), undefined);
      const closeStub = sinon.stub(conn, "close").resolves();

      await manager.removeConnection("conn-1");

      expect(closeStub.calledOnce).to.be.true;
      expect(manager.getConnection("conn-1")).to.be.undefined;
    });

    it("should be a no-op for unknown id", async () => {
      await manager.removeConnection("nope"); // should not throw
    });
  });

  describe("testConnection", () => {
    it("should return false for unknown id", async () => {
      expect(await manager.testConnection("nope")).to.be.false;
    });

    it("should return true when ping succeeds", async () => {
      const conn = manager.createConnection(makeConnectionOpts(), undefined);
      sinon.stub(conn, "pingClient").resolves();
      expect(await manager.testConnection("conn-1")).to.be.true;
    });

    it("should return false when ping throws", async () => {
      const conn = manager.createConnection(makeConnectionOpts(), undefined);
      sinon.stub(conn, "pingClient").rejects(new Error("timeout"));
      expect(await manager.testConnection("conn-1")).to.be.false;
    });
  });

  describe("startPingService / stopPingService", () => {
    it("should set startDate and clear it on stop", async () => {
      const conn = manager.createConnection(makeConnectionOpts(), undefined);
      sinon.stub(conn, "pingClient").resolves();

      await manager.startPingService();
      expect(manager.getStartDate()).to.be.instanceOf(Date);

      manager.stopPingService();
      expect(manager.getStartDate()).to.be.null;
    });

    it("should call pingClient on each connection", async () => {
      const conn = manager.createConnection(makeConnectionOpts(), undefined);
      const stub = sinon.stub(conn, "pingClient").resolves();

      await manager.startPingService();
      expect(stub.calledOnce).to.be.true;

      manager.stopPingService();
    });
  });

  // NOTE: createServer / reloadServer cannot be unit-tested here because
  // MCPServer's constructor calls injector().resolve("mcpManager") which
  // fails due to a circular dependency (MCPManager ↔ MCPServer) in the
  // CommonJS test environment. Those paths are covered by e2e tests.
  // Below we test the map-management logic directly.

  describe("getServer / getServerByPath / getServers", () => {
    it("should retrieve a server by id and path", () => {
      const fake = makeFakeServer({ id: "srv-1", serverPath: "test-srv" });
      // Insert directly into private maps to bypass MCPServer constructor
      (manager as any).servers.set("srv-1", fake);
      (manager as any).serversByPath.set("test-srv", fake);

      expect(manager.getServer("srv-1")).to.equal(fake);
      expect(manager.getServerByPath("test-srv")).to.equal(fake);
    });

    it("should return undefined for unknown id/path", () => {
      expect(manager.getServer("nope")).to.be.undefined;
      expect(manager.getServerByPath("nope")).to.be.undefined;
    });

    it("should iterate all servers", () => {
      const f1 = makeFakeServer({ id: "s1", serverPath: "p1" });
      const f2 = makeFakeServer({ id: "s2", serverPath: "p2" });
      (manager as any).servers.set("s1", f1);
      (manager as any).servers.set("s2", f2);

      const ids = Array.from(manager.getServers()).map((s) => s.id);
      expect(ids).to.have.members(["s1", "s2"]);
    });
  });

  describe("removeServer", () => {
    it("should close and delete the server and its path entry", async () => {
      const fake = makeFakeServer({ id: "srv-1", serverPath: "test-srv" });
      (manager as any).servers.set("srv-1", fake);
      (manager as any).serversByPath.set("test-srv", fake);

      await manager.removeServer("srv-1");

      expect(fake.close.calledOnce).to.be.true;
      expect(manager.getServer("srv-1")).to.be.undefined;
      expect(manager.getServerByPath("test-srv")).to.be.undefined;
    });

    it("should be a no-op for unknown id", async () => {
      await manager.removeServer("nope");
    });
  });

  describe("reloadConnection", () => {
    it("should remove and recreate the connection then connect", async () => {
      const opts = makeConnectionOpts();
      const original = manager.createConnection(opts, undefined);
      sinon.stub(original, "close").resolves();

      await manager.reloadConnection(opts);

      const reloaded = manager.getConnection("conn-1");
      expect(reloaded).to.exist;
      expect(reloaded).to.not.equal(original);
    });
  });
});
