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
import { request } from "chai-http";
import sinon from "sinon";
import { Express } from "express";
import { schemas } from "aloha-shared";
import {
  createMockDependencies,
  setupMockInjector,
  restoreInjector,
  createTestApp,
  setupAuthPlugins,
  teardownAuthPlugins,
  adminUser,
  regularUser,
  adminDbUser,
  regularDbUser,
  MockDependencies,
} from "./endpoint-test-helpers";
import { setAuthPlugins } from "../../src/middleware/authorise";
import { serverRoutes } from "../../src/endpoints/servers";
import { HTTPError } from "../../src/endpoints/utils";

const http = (app: Express) => request.execute(app);

const validServer: schemas.MCPServerOptions = {
  name: "Test Server",
  serverPath: "test-server",
  creator: "user-1",
  visibility: schemas.Visibility.Public,
  type: "server",
};

const serverWithId = { ...validServer, id: "s1" };

describe("serverRoutes", () => {
  let deps: MockDependencies;
  let app: any;

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
    setupAuthPlugins();
    const router = serverRoutes();
    app = createTestApp(router, { user: adminUser, basePath: "/api/servers" });
  });

  after(() => {
    restoreInjector();
    teardownAuthPlugins();
  });

  beforeEach(() => {
    deps.serverOptionsRepository.findByPattern.reset();
    deps.serverOptionsRepository.findByPattern.resolves([]);
    deps.serverOptionsRepository.findById.reset();
    deps.serverOptionsRepository.findById.resolves(null);
    deps.serverOptionsRepository.create.reset();
    deps.serverOptionsRepository.create.callsFake(async (item: any) => ({ ...item, id: "s-new" }));
    deps.serverOptionsRepository.updateById.reset();
    deps.serverOptionsRepository.updateById.resolves(true);
    deps.serverOptionsRepository.deleteById.reset();
    deps.serverOptionsRepository.deleteById.resolves(true);
    deps.serverOptionsRepository.addNewConnection.reset();
    deps.serverOptionsRepository.addNewConnection.resolves(true);
    deps.serverOptionsRepository.replaceConnections.reset();
    deps.serverOptionsRepository.replaceConnections.resolves(true);
    deps.serverOptionsRepository.findByConnectionId.reset();
    deps.serverOptionsRepository.findByConnectionId.resolves([]);
    deps.mcpManager.getServer.reset();
    deps.mcpManager.getServer.returns(null);
    deps.mcpManager.getConnection.reset();
    deps.mcpManager.getConnection.returns(null);
    deps.mcpManager.createServer.reset();
    deps.mcpManager.removeServer.reset();
    deps.mcpManager.removeServer.resolves();
    deps.userRepository.findById.reset();
    deps.userRepository.findById.resolves(adminDbUser);
    deps.fetchCache.clear.resetHistory();
  });

  // ── LIST ──────────────────────────────────────────────────────────────

  describe("GET / (list)", () => {
    it("should return servers with isOnline status", async () => {
      deps.serverOptionsRepository.findByPattern.resolves([serverWithId]);
      deps.mcpManager.getServer.withArgs("s1").returns({ options: serverWithId });
      const res = await http(app).get("/api/servers");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.lengthOf(1);
      expect(res.body[0].isOnline).to.be.true;
    });

    it("should mark offline servers", async () => {
      deps.serverOptionsRepository.findByPattern.resolves([serverWithId]);
      const res = await http(app).get("/api/servers");
      expect(res.status).to.equal(200);
      expect(res.body[0].isOnline).to.be.false;
    });
  });

  // ── GET ───────────────────────────────────────────────────────────────

  describe("GET /:id (get)", () => {
    it("should return server with connectionsDetail", async () => {
      const srv = { ...serverWithId, connections: ["c1"] };
      deps.serverOptionsRepository.findById.resolves(srv);
      deps.mcpManager.getConnection.withArgs("c1").returns({
        connectionOptions: { name: "Client1", type: "client" },
        isConnected: true,
      });
      const res = await http(app).get("/api/servers/s1");
      expect(res.status).to.equal(200);
      expect(res.body.connectionsDetail).to.have.lengthOf(1);
      expect(res.body.connectionsDetail[0].name).to.equal("Client1");
    });

    it("should return 404 for unknown server", async () => {
      const res = await http(app).get("/api/servers/unknown");
      expect(res.status).to.equal(404);
    });
  });

  // ── CREATE ────────────────────────────────────────────────────────────

  describe("POST / (create)", () => {
    it("should create a server and call mcpManager.createServer", async () => {
      const res = await http(app).post("/api/servers").send(validServer);
      expect(res.status).to.equal(204);
      expect(deps.serverOptionsRepository.create.calledOnce).to.be.true;
      expect(deps.mcpManager.createServer.calledOnce).to.be.true;
    });

    it("should return 409 for duplicate serverPath", async () => {
      deps.serverOptionsRepository.findByPattern.resolves([serverWithId]);
      const res = await http(app).post("/api/servers").send(validServer);
      expect(res.status).to.equal(409);
    });

    it("should return 500 when logged user not found", async () => {
      deps.userRepository.findById.resolves(null);
      const res = await http(app).post("/api/servers").send(validServer);
      expect(res.status).to.equal(500);
    });
  });

  // ── UPDATE ────────────────────────────────────────────────────────────

  describe("POST /:id (update)", () => {
    it("should update a server", async () => {
      deps.serverOptionsRepository.findById.resolves(serverWithId);
      const res = await http(app).post("/api/servers/s1").send({ name: "Updated" });
      expect(res.status).to.equal(204);
    });

    it("should return 404 when server not found", async () => {
      const res = await http(app).post("/api/servers/unknown").send({ name: "X" });
      expect(res.status).to.equal(404);
    });

    it("should return 409 for duplicate serverPath from another server", async () => {
      deps.serverOptionsRepository.findById.resolves(serverWithId);
      deps.serverOptionsRepository.findByPattern.resolves([{ ...validServer, id: "s-other" }]);
      const res = await http(app).post("/api/servers/s1").send({ serverPath: "test-server" });
      expect(res.status).to.equal(409);
    });

    it("should allow same serverPath for the same server", async () => {
      deps.serverOptionsRepository.findById.resolves(serverWithId);
      deps.serverOptionsRepository.findByPattern.resolves([serverWithId]);
      const res = await http(app).post("/api/servers/s1").send({ serverPath: "test-server" });
      expect(res.status).to.equal(204);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────

  describe("POST /:id/_delete (delete)", () => {
    it("should delete and call mcpManager.removeServer", async () => {
      deps.serverOptionsRepository.findById.resolves(serverWithId);
      const res = await http(app).post("/api/servers/s1/_delete");
      expect(res.status).to.equal(204);
      expect(deps.mcpManager.removeServer.calledOnce).to.be.true;
    });

    it("should return 404 when server not found", async () => {
      const res = await http(app).post("/api/servers/unknown/_delete");
      expect(res.status).to.equal(404);
    });
  });

  // ── CONNECT / DISCONNECT ──────────────────────────────────────────────

  describe("POST /:id/_connect/:cid", () => {
    it("should associate a client to a server", async () => {
      deps.serverOptionsRepository.findById.resolves(serverWithId);
      deps.mcpManager.getServer.returns({ options: { ...serverWithId, connections: [] } });
      deps.mcpManager.getConnection.returns({ connectionOptions: { ...validServer, creator: "user-1", visibility: schemas.Visibility.Public } });
      const res = await http(app).post("/api/servers/s1/_connect/c1");
      expect(res.status).to.equal(204);
      expect(deps.serverOptionsRepository.addNewConnection.calledOnce).to.be.true;
    });

    it("should return 204 if already connected", async () => {
      deps.mcpManager.getServer.returns({ options: { ...serverWithId, connections: ["c1"] } });
      deps.mcpManager.getConnection.returns({ connectionOptions: { ...validServer, creator: "user-1", visibility: schemas.Visibility.Public } });
      const res = await http(app).post("/api/servers/s1/_connect/c1");
      expect(res.status).to.equal(204);
      expect(deps.serverOptionsRepository.addNewConnection.called).to.be.false;
    });

    it("should return 404 when server not found", async () => {
      const res = await http(app).post("/api/servers/s1/_connect/c1");
      expect(res.status).to.equal(404);
    });

    it("should return 404 when connection not found", async () => {
      deps.mcpManager.getServer.returns({ options: { ...serverWithId, connections: [] } });
      const res = await http(app).post("/api/servers/s1/_connect/c1");
      expect(res.status).to.equal(404);
    });
  });

  describe("POST /:id/_disconnect/:cid", () => {
    it("should dissociate a client from a server", async () => {
      deps.serverOptionsRepository.findById.resolves({ ...serverWithId, connections: ["c1"] });
      deps.mcpManager.getServer.returns({ options: { ...serverWithId, connections: ["c1"] } });
      const res = await http(app).post("/api/servers/s1/_disconnect/c1");
      expect(res.status).to.equal(204);
      expect(deps.serverOptionsRepository.replaceConnections.calledOnce).to.be.true;
    });

    it("should return 204 if not connected", async () => {
      deps.serverOptionsRepository.findById.resolves({ ...serverWithId, connections: [] });
      deps.mcpManager.getServer.returns({ options: { ...serverWithId, connections: [] } });
      const res = await http(app).post("/api/servers/s1/_disconnect/c1");
      expect(res.status).to.equal(204);
      expect(deps.serverOptionsRepository.replaceConnections.called).to.be.false;
    });

    it("should return 404 when server not found", async () => {
      const res = await http(app).post("/api/servers/s1/_disconnect/c1");
      expect(res.status).to.equal(404);
    });
  });

  // ── BY CONNECTION ID ──────────────────────────────────────────────────

  describe("GET /by_connection_id/:cid", () => {
    it("should return servers for a connection", async () => {
      deps.serverOptionsRepository.findByConnectionId.resolves([serverWithId]);
      const res = await http(app).get("/api/servers/by_connection_id/c1");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.lengthOf(1);
    });

    it("should return 500 on error", async () => {
      deps.serverOptionsRepository.findByConnectionId.rejects(new Error("db error"));
      const res = await http(app).get("/api/servers/by_connection_id/c1");
      expect(res.status).to.equal(500);
    });
  });

  // ── AUTHENTICATION ────────────────────────────────────────────────────

  describe("authentication", () => {
    it("should return 401 for unauthenticated user on list", async () => {
      const unauthApp = createTestApp(serverRoutes(), { basePath: "/api/servers" });
      const res = await http(unauthApp).get("/api/servers");
      expect(res.status).to.equal(401);
    });
  });

  // ── WRITE PERMISSION ENFORCEMENT ──────────────────────────────────────

  describe("write permission enforcement", () => {
    let restrictedApp: Express;

    before(() => {
      setAuthPlugins([]);
      restrictedApp = createTestApp(serverRoutes(), { user: regularUser, basePath: "/api/servers" });
    });

    after(() => setupAuthPlugins());

    it("should return 403 on create without ServersWrite", async () => {
      const res = await http(restrictedApp).post("/api/servers").send(validServer);
      expect(res.status).to.equal(403);
    });

    it("should return 403 on delete without ServersWrite", async () => {
      const res = await http(restrictedApp).post("/api/servers/s1/_delete");
      expect(res.status).to.equal(403);
    });
  });

  // ── ERROR HANDLING ────────────────────────────────────────────────────

  describe("error handling", () => {
    it("should return 500 on unexpected repository error", async () => {
      deps.serverOptionsRepository.findByPattern.rejects(new Error("DB down"));
      const res = await http(app).get("/api/servers");
      expect(res.status).to.equal(500);
    });

    it("should return HTTPError status code", async () => {
      deps.serverOptionsRepository.findByPattern.rejects(new HTTPError(503, "Unavailable"));
      const res = await http(app).get("/api/servers");
      expect(res.status).to.equal(503);
      expect(res.body.error).to.equal("Unavailable");
    });
  });
});
