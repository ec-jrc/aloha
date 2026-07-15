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
import express from "express";
import { schemas, authentication_strategy } from "aloha-shared";
import { z } from "zod";
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
import {
  HTTPError,
  validateRequestBody,
  injectDefaultVisibility,
  verifyPermission,
  crudGenerator,
  permissionsManagerGenerator,
} from "../../src/endpoints/utils";

const http = (app: express.Express) => request.execute(app);

// ── HTTPError ───────────────────────────────────────────────────────────────

describe("HTTPError", () => {
  it("should store errorCode and message", () => {
    const err = new HTTPError(404, "Not found");
    expect(err.errorCode).to.equal(404);
    expect(err.message).to.equal("Not found");
    expect(err).to.be.instanceOf(Error);
  });

  it("should use default message when none provided", () => {
    const err = new HTTPError(500);
    expect(err.message).to.equal("Error 500");
  });
});

// ── validateRequestBody ─────────────────────────────────────────────────────

describe("validateRequestBody", () => {
  const TestSchema = z.object({ name: z.string(), value: z.number() });
  const logger = () =>
    ({
      info: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      child: sinon.stub().returnsThis(),
    }) as any;

  it("should call next() for valid body", (done) => {
    const req = { body: { name: "test", value: 42 } } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    validateRequestBody(TestSchema, logger)(req, res, () => done());
  });

  it("should return 400 for invalid body (ZodError)", () => {
    const req = { body: { name: 123 } } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    validateRequestBody(TestSchema, logger)(req, res, next);
    expect(next.called).to.be.false;
    expect(res.status.calledWith(400)).to.be.true;
  });

  it("should return 500 for non-Zod errors", () => {
    // Use a schema whose parse throws a non-ZodError
    const badSchema = {
      parse: () => {
        throw new Error("boom");
      },
    } as any;
    const req = { body: {} } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    validateRequestBody(badSchema, logger)(req, res, next);
    expect(res.status.calledWith(500)).to.be.true;
  });
});

// ── injectDefaultVisibility ─────────────────────────────────────────────────

describe("injectDefaultVisibility", () => {
  let deps: MockDependencies;

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
  });
  after(() => restoreInjector());

  beforeEach(() => {
    deps.userRepository.findById.resolves(adminDbUser);
  });

  it("should inject creator and visibility for authenticated user", async () => {
    const req = {
      body: {
        name: "test",
        serverUrl: "http://x",
        serverProtocol: "http",
        type: "client",
      },
      session: { user: adminUser },
    } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    await injectDefaultVisibility(schemas.MCPConnectionOptionsSchema)(
      req,
      res,
      next
    );
    expect(req.body.creator).to.equal(adminDbUser.id);
    expect(req.body.visibility).to.equal(schemas.Visibility.Private);
    expect(next.calledOnce).to.be.true;
  });

  it("should return 401 when user not authenticated and schema has visibility", async () => {
    const req = { body: { name: "test" }, session: {} } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis(),
    } as any;
    const next = sinon.stub();
    await injectDefaultVisibility(schemas.MCPConnectionOptionsSchema)(
      req,
      res,
      next
    );
    expect(res.status.calledWith(401)).to.be.true;
    expect(next.called).to.be.false;
  });

  it("should not inject defaults for non-visibility schemas", async () => {
    const TestSchema = z.object({ name: z.string(), value: z.number() });
    const req = { body: { name: "test", value: 42 }, session: {} } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    await injectDefaultVisibility(TestSchema)(req, res, next);
    expect(next.calledOnce).to.be.true;
    expect(req.body.creator).to.be.undefined;
  });

  it("should keep provided creator when user is admin", async () => {
    const req = {
      body: {
        creator: "explicit-creator",
        name: "test",
        serverUrl: "http://x",
        serverProtocol: "http",
        type: "client",
      },
      session: { user: adminUser },
    } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    await injectDefaultVisibility(schemas.MCPConnectionOptionsSchema)(
      req,
      res,
      next
    );
    expect(req.body.creator).to.equal("explicit-creator");
    expect(next.calledOnce).to.be.true;
  });

  it("should overwrite creator for non-admin even if provided", async () => {
    deps.userRepository.findById.resolves(regularDbUser);
    const req = {
      body: {
        creator: "explicit-creator",
        name: "test",
        serverUrl: "http://x",
        serverProtocol: "http",
        type: "client",
      },
      session: { user: regularUser },
    } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    await injectDefaultVisibility(schemas.MCPConnectionOptionsSchema)(
      req,
      res,
      next
    );
    expect(req.body.creator).to.equal(regularDbUser.id);
    expect(next.calledOnce).to.be.true;
  });

  it("should use user.id directly for NO-AUTH provider", async () => {
    const noAuthUser = { ...adminUser, provider: "NO-AUTH", id: "NOAUTH_user" };
    const req = {
      body: {
        name: "test",
        serverUrl: "http://x",
        serverProtocol: "http",
        type: "client",
      },
      session: { user: noAuthUser },
    } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    await injectDefaultVisibility(schemas.MCPConnectionOptionsSchema)(
      req,
      res,
      next
    );
    expect(req.body.creator).to.equal("NOAUTH_user");
    expect(next.calledOnce).to.be.true;
  });

  it("should not overwrite existing visibility", async () => {
    const req = {
      body: {
        visibility: schemas.Visibility.Public,
        name: "test",
        serverUrl: "http://x",
        serverProtocol: "http",
        type: "client",
      },
      session: { user: adminUser },
    } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    } as any;
    const next = sinon.stub();
    await injectDefaultVisibility(schemas.MCPConnectionOptionsSchema)(
      req,
      res,
      next
    );
    expect(req.body.visibility).to.equal(schemas.Visibility.Public);
  });
});

// ── verifyPermission ────────────────────────────────────────────────────────

describe("verifyPermission", () => {
  let deps: MockDependencies;

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
  });
  after(() => restoreInjector());

  beforeEach(() => {
    deps.userRepository.findById.resolves(adminDbUser);
  });

  const publicObj: schemas.VisibilityInterface = {
    creator: "someone-else",
    visibility: schemas.Visibility.Public,
  };
  const privateObj: schemas.VisibilityInterface = {
    creator: "someone-else",
    visibility: schemas.Visibility.Private,
  };
  const ownedObj: schemas.VisibilityInterface = {
    creator: "user-1",
    visibility: schemas.Visibility.Private,
  };
  const managedObj: schemas.VisibilityInterface = {
    creator: "someone-else",
    visibility: schemas.Visibility.Managed,
    projects: ["proj-1"],
  };
  const orphanedObj: schemas.VisibilityInterface = {
    creator: undefined as any,
    visibility: schemas.Visibility.Private,
  };

  it("should allow read on public objects without authentication", async () => {
    const req = { session: {} } as any;
    expect(await verifyPermission(publicObj, req, "read")).to.be.true;
  });

  it("should deny write on public objects without authentication", async () => {
    const req = { session: {} } as any;
    expect(await verifyPermission(publicObj, req, "write")).to.be.false;
  });

  it("should allow creator full access to their own objects", async () => {
    const req = { session: { user: adminUser } } as any;
    expect(await verifyPermission(ownedObj, req, "write")).to.be.true;
    expect(await verifyPermission(ownedObj, req, "read")).to.be.true;
  });

  it("should deny unauthenticated users on private objects", async () => {
    const req = { session: {} } as any;
    expect(await verifyPermission(privateObj, req, "read")).to.be.false;
  });

  it("should throw HTTPError when raiseException is true", async () => {
    const req = { session: {} } as any;
    try {
      await verifyPermission(privateObj, req, "read", true);
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).to.be.instanceOf(HTTPError);
      expect(e.errorCode).to.equal(401);
    }
  });

  it("should allow admin read on any object", async () => {
    const req = { session: { user: adminUser } } as any;
    expect(await verifyPermission(privateObj, req, "read")).to.be.true;
  });

  it("should deny non-admin read on private objects they don't own", async () => {
    deps.userRepository.findById.resolves(regularDbUser);
    const req = { session: { user: regularUser } } as any;
    expect(await verifyPermission(privateObj, req, "read")).to.be.false;
  });

  it("should allow execute on public objects for authenticated users", async () => {
    deps.userRepository.findById.resolves(regularDbUser);
    const req = { session: { user: regularUser } } as any;
    expect(await verifyPermission(publicObj, req, "execute")).to.be.true;
  });

  it("should allow admin full access on orphaned objects", async () => {
    const req = { session: { user: adminUser } } as any;
    expect(await verifyPermission(orphanedObj, req, "write")).to.be.true;
  });

  it("should allow managed object access when user shares a project", async () => {
    deps.userRepository.findById.resolves(regularDbUser);
    deps.userProjectsCache.get.callsFake(async (_k: string, vp: any) => vp());
    deps.userRepository.projectsByUser.resolves([{ id: "proj-1", name: "P1" }]);
    const req = { session: { user: regularUser } } as any;
    expect(await verifyPermission(managedObj, req, "read")).to.be.true;
  });

  it("should deny managed object access when user has no shared project", async () => {
    deps.userRepository.findById.resolves(regularDbUser);
    deps.userProjectsCache.get.callsFake(async (_k: string, vp: any) => vp());
    deps.userRepository.projectsByUser.resolves([
      { id: "proj-other", name: "Other" },
    ]);
    const req = { session: { user: regularUser } } as any;
    expect(await verifyPermission(managedObj, req, "read")).to.be.false;
  });
});

// ── crudGenerator ───────────────────────────────────────────────────────────

describe("crudGenerator", () => {
  let deps: MockDependencies;
  let app: express.Express;

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
    setupAuthPlugins();

    const router = crudGenerator({
      name: "item",
      repository: () => deps.projectRepository as any,
      schema: schemas.ProjectSchema,
      logger: () =>
        ({
          info: sinon.stub(),
          debug: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
          child: sinon.stub().returnsThis(),
        }) as any,
      readPermissions: [],
      writePermissions: [],
      endpoints: {
        list: true,
        get: true,
        create: true,
        update: true,
        delete: true,
      },
    });
    app = createTestApp(router, { user: adminUser, basePath: "/items" });
  });

  after(() => {
    restoreInjector();
    teardownAuthPlugins();
  });

  beforeEach(() => {
    deps.projectRepository.findByPattern.resolves([]);
    deps.projectRepository.findById.resolves(null);
    deps.projectRepository.create.callsFake(async (item: any) => ({
      ...item,
      id: "new-id",
    }));
    deps.projectRepository.updateById.resolves(true);
    deps.projectRepository.deleteById.resolves(true);
    deps.fetchCache.clear.resetHistory();
  });

  describe("GET / (list)", () => {
    it("should return an empty list", async () => {
      const res = await http(app).get("/items");
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal([]);
    });

    it("should return items from repository", async () => {
      const items = [
        { id: "1", projectId: "p1", name: "P1", description: "d" },
      ];
      deps.projectRepository.findByPattern.resolves(items);
      const res = await http(app).get("/items");
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal(items);
    });
  });

  describe("GET /:id (get)", () => {
    it("should return 404 when item not found", async () => {
      const res = await http(app).get("/items/nonexistent");
      expect(res.status).to.equal(404);
      expect(res.body.error).to.include("not found");
    });

    it("should return item when found", async () => {
      const item = { id: "1", projectId: "p1", name: "P1", description: "d" };
      deps.projectRepository.findById.resolves(item);
      const res = await http(app).get("/items/1");
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal(item);
    });
  });

  describe("POST / (create)", () => {
    it("should create an item and return 204", async () => {
      deps.userRepository.findById.resolves(adminDbUser);
      const res = await http(app).post("/items").send({
        projectId: "proj1",
        name: "New Project",
        description: "desc",
      });
      expect(res.status).to.equal(204);
    });

    it("should return 400 for invalid body", async () => {
      const res = await http(app).post("/items").send({ bad: "data" });
      expect(res.status).to.equal(400);
    });
  });

  describe("POST /:id (update)", () => {
    it("should update an item and return 204", async () => {
      const res = await http(app).post("/items/1").send({ name: "Updated" });
      expect(res.status).to.equal(204);
    });

    it("should return 404 when update target not found", async () => {
      deps.projectRepository.updateById.resolves(false);
      const res = await http(app).post("/items/1").send({ name: "Updated" });
      expect(res.status).to.equal(404);
    });
  });

  describe("POST /:id/_delete (delete)", () => {
    it("should delete an item and return 204", async () => {
      const res = await http(app).post("/items/1/_delete");
      expect(res.status).to.equal(204);
    });

    it("should return 404 when delete target not found", async () => {
      deps.projectRepository.deleteById.resolves(false);
      const res = await http(app).post("/items/1/_delete");
      expect(res.status).to.equal(404);
    });
  });

  describe("error handling", () => {
    it("should return HTTPError status code on list", async () => {
      deps.projectRepository.findByPattern.rejects(
        new HTTPError(403, "Forbidden")
      );
      const res = await http(app).get("/items");
      expect(res.status).to.equal(403);
      expect(res.body.error).to.equal("Forbidden");
    });

    it("should return 500 on unexpected error", async () => {
      deps.projectRepository.findByPattern.rejects(new Error("DB down"));
      const res = await http(app).get("/items");
      expect(res.status).to.equal(500);
    });
  });
});

// ── crudGenerator with disabled endpoints ───────────────────────────────────

describe("crudGenerator with disabled endpoints", () => {
  let deps: MockDependencies;
  let app: express.Express;

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
    setupAuthPlugins();

    const router = crudGenerator({
      name: "item",
      repository: () => deps.projectRepository as any,
      schema: schemas.ProjectSchema,
      logger: () =>
        ({
          info: sinon.stub(),
          debug: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
          child: sinon.stub().returnsThis(),
        }) as any,
      endpoints: {
        list: false,
        get: false,
        create: false,
        update: false,
        delete: false,
      },
    });
    app = createTestApp(router, { user: adminUser, basePath: "/items" });
  });

  after(() => {
    restoreInjector();
    teardownAuthPlugins();
  });

  it("should return 404 for disabled list endpoint", async () => {
    const res = await http(app).get("/items");
    expect(res.status).to.be.oneOf([404, 500]);
  });
});

// ── crudGenerator with custom factories ─────────────────────────────────────

describe("crudGenerator with custom factories", () => {
  let deps: MockDependencies;
  let app: express.Express;
  const customSchema = z.object({ id: z.string(), name: z.string() });
  const customListFactory = sinon
    .stub()
    .resolves([{ id: "custom", name: "Custom" }]);

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
    setupAuthPlugins();

    const router = crudGenerator({
      name: "item",
      repository: () => deps.projectRepository as any,
      schema: customSchema,
      logger: () =>
        ({
          info: sinon.stub(),
          debug: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
          child: sinon.stub().returnsThis(),
        }) as any,
      readPermissions: [],
      endpoints: {
        list: customListFactory,
        get: {
          enableCache: false,
          factory: async (req) => ({ id: req.params.id, name: "cached" }),
        },
      },
    });
    app = createTestApp(router, { user: adminUser, basePath: "/items" });
  });

  after(() => {
    restoreInjector();
    teardownAuthPlugins();
  });

  it("should use custom list factory", async () => {
    const res = await http(app).get("/items");
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal([{ id: "custom", name: "Custom" }]);
  });

  it("should use custom get factory with enableCache:false", async () => {
    const res = await http(app).get("/items/42");
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ id: "42", name: "cached" });
  });
});

// ── permissionsManagerGenerator ─────────────────────────────────────────────

describe("permissionsManagerGenerator", () => {
  let deps: MockDependencies;
  let app: express.Express;
  let afterCallback: sinon.SinonStub;

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
    setupAuthPlugins();
    afterCallback = sinon.stub().resolves();

    const router = express.Router();
    router.use(express.json());
    permissionsManagerGenerator({
      router,
      name: "testEntity",
      repository: () => deps.serverOptionsRepository as any,
      logger: () =>
        ({
          info: sinon.stub(),
          debug: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
          child: sinon.stub().returnsThis(),
        }) as any,
      writePermissions: [],
      afterVisibilityChangeCallback: afterCallback,
    });
    app = createTestApp(router, { user: adminUser, basePath: "/entities" });
  });

  after(() => {
    restoreInjector();
    teardownAuthPlugins();
  });

  beforeEach(() => {
    deps.serverOptionsRepository.findById.resolves(null);
    deps.serverOptionsRepository.updateById.resolves(true);
    deps.serverOptionsRepository.setVisibility.resolves(true);
    deps.userRepository.findById.resolves(adminDbUser);
    afterCallback.resetHistory();
  });

  describe("POST /:id/_setCreator", () => {
    it("should return 404 when entity not found", async () => {
      const res = await http(app)
        .post("/entities/1/_setCreator")
        .send({ creator: "new-creator" });
      expect(res.status).to.equal(404);
    });

    it("should set creator and return 204", async () => {
      deps.serverOptionsRepository.findById.resolves({
        id: "1",
        name: "s",
        creator: "old",
      });
      const res = await http(app)
        .post("/entities/1/_setCreator")
        .send({ creator: "new-creator" });
      expect(res.status).to.equal(204);
      expect(deps.serverOptionsRepository.updateById.calledOnce).to.be.true;
    });

    it("should return 400 for empty creator", async () => {
      deps.serverOptionsRepository.findById.resolves({ id: "1", name: "s" });
      const res = await http(app)
        .post("/entities/1/_setCreator")
        .send({ creator: "" });
      expect(res.status).to.equal(400);
    });

    it("should return 500 when updateById fails", async () => {
      deps.serverOptionsRepository.findById.resolves({
        id: "1",
        name: "s",
        creator: "old",
      });
      deps.serverOptionsRepository.updateById.resolves(false);
      const res = await http(app)
        .post("/entities/1/_setCreator")
        .send({ creator: "new-creator" });
      expect(res.status).to.equal(500);
    });
  });

  describe("POST /:id/_setVisibility", () => {
    it("should return 404 when entity not found", async () => {
      const res = await http(app)
        .post("/entities/1/_setVisibility")
        .send({ visibility: "public", creator: "user-1" });
      expect(res.status).to.equal(404);
    });

    it("should set visibility and return 204", async () => {
      deps.serverOptionsRepository.findById.resolves({
        id: "1",
        name: "s",
        creator: "user-1",
        visibility: schemas.Visibility.Private,
      });
      const res = await http(app)
        .post("/entities/1/_setVisibility")
        .send({ visibility: "public", creator: "user-1" });
      expect(res.status).to.equal(204);
      expect(deps.serverOptionsRepository.setVisibility.calledOnce).to.be.true;
    });

    it("should call afterVisibilityChangeCallback", async () => {
      deps.serverOptionsRepository.findById.resolves({
        id: "1",
        name: "s",
        creator: "user-1",
        visibility: schemas.Visibility.Private,
      });
      await http(app)
        .post("/entities/1/_setVisibility")
        .send({ visibility: "public", creator: "user-1" });
      expect(afterCallback.calledOnce).to.be.true;
    });

    it("should return 403 when user lacks write permission on private object", async () => {
      deps.serverOptionsRepository.findById.resolves({
        id: "1",
        name: "s",
        creator: "someone-else",
        visibility: schemas.Visibility.Private,
      });
      deps.userRepository.findById.resolves(regularDbUser);
      const router2 = express.Router();
      router2.use(express.json());
      permissionsManagerGenerator({
        router: router2,
        name: "testEntity",
        repository: () => deps.serverOptionsRepository as any,
        logger: () =>
          ({
            info: sinon.stub(),
            debug: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            child: sinon.stub().returnsThis(),
          }) as any,
        writePermissions: [],
      });
      const appRegular = createTestApp(router2, {
        user: regularUser,
        basePath: "/entities",
      });
      const res = await http(appRegular)
        .post("/entities/1/_setVisibility")
        .send({ visibility: "public", creator: "someone-else" });
      expect(res.status).to.equal(403);
    });

    it("should return 500 when setVisibility throws", async () => {
      deps.serverOptionsRepository.findById.resolves({
        id: "1",
        name: "s",
        creator: "user-1",
        visibility: schemas.Visibility.Private,
      });
      deps.serverOptionsRepository.setVisibility.rejects(new Error("DB error"));
      const res = await http(app)
        .post("/entities/1/_setVisibility")
        .send({ visibility: "public", creator: "user-1" });
      expect(res.status).to.equal(500);
    });
  });
});

// ── _setCreator authorization ───────────────────────────────────────────────

describe("permissionsManagerGenerator _setCreator authorization", () => {
  let deps: MockDependencies;

  function buildApp(user: authentication_strategy.UserPrincipal) {
    const router = express.Router();
    router.use(express.json());
    permissionsManagerGenerator({
      router,
      name: "testEntity",
      repository: () => deps.serverOptionsRepository as any,
      logger: () =>
        ({
          info: sinon.stub(),
          debug: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
          child: sinon.stub().returnsThis(),
        }) as any,
      writePermissions: [],
    });
    return createTestApp(router, { user, basePath: "/entities" });
  }

  before(() => {
    deps = createMockDependencies();
    setupMockInjector(deps);
    setupAuthPlugins();
  });

  after(() => {
    restoreInjector();
    teardownAuthPlugins();
  });

  beforeEach(() => {
    deps.serverOptionsRepository.findById.resolves({
      id: "1",
      name: "s",
      creator: "user-1",
      visibility: schemas.Visibility.Private,
    });
    deps.serverOptionsRepository.updateById.resolves(true);
    deps.userRepository.findById.resolves(adminDbUser);
  });

  it("should allow an administrator to change the creator", async () => {
    const app = buildApp(adminUser);
    const res = await http(app)
      .post("/entities/1/_setCreator")
      .send({ creator: "someone-else" });
    expect(res.status).to.equal(204);
  });

  it("should allow the current creator to change the creator", async () => {
    // entity creator is "user-1", adminUser.id is "user-1" — but test with
    // a non-admin user whose id matches the entity creator
    const creatorUser: authentication_strategy.UserPrincipal = {
      id: "user-2",
      userId: "creator-user",
      displayName: "Creator",
      permissions: [authentication_strategy.Permissions.UsersRead],
      provider: "test",
    };
    const creatorDbUser = {
      id: "user-2",
      userId: "creator-user",
      fullName: "Creator",
      permissions: [authentication_strategy.Permissions.UsersRead],
      disabled: false,
    };
    deps.serverOptionsRepository.findById.resolves({
      id: "1",
      name: "s",
      creator: "user-2",
      visibility: schemas.Visibility.Private,
    });
    deps.userRepository.findById.resolves(creatorDbUser);

    const app = buildApp(creatorUser);
    const res = await http(app)
      .post("/entities/1/_setCreator")
      .send({ creator: "new-owner" });
    expect(res.status).to.equal(204);
  });

  it("should reject a non-admin, non-creator user from changing the creator", async () => {
    deps.userRepository.findById.resolves(regularDbUser);

    const app = buildApp(regularUser);
    const res = await http(app)
      .post("/entities/1/_setCreator")
      .send({ creator: "someone-else" });
    // Entity creator is "user-1", regularUser.id is "user-2", and regularUser is not admin
    // Expected: 401 or 403 rejection
    expect(res.status).to.be.oneOf([401, 403]);
  });
});
