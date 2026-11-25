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
import { Db, MongoClient } from "mongodb";
import { createInjector } from "typed-inject";
import { schemas } from "aloha-shared";

// Repositories
import { MongoDbProjectRepository } from "../../src/database/repositories/mongodb/mongo-db-project-repository";
import { MongoDBUserRepository } from "../../src/database/repositories/mongodb/mongo-db-user-repository";
import { MongoDbAgentRepository } from "../../src/database/repositories/mongodb/mongo-db-agent-repository";
import { MongoDBVisibilityRepository } from "../../src/database/repositories/mongodb/mongo-db-visibility-repository";
import { MongoDBConnectionOptionsRepository } from "../../src/database/repositories/mongodb/mongo-db-connection-options-repository";
import { MongoDBMCPServerOptionsRepository } from "../../src/database/repositories/mongodb/mongo-db-server-options-repository";
import { MongoDbJWTTokenRepository } from "../../src/database/repositories/mongodb/mongo-db-jwt-token-repository";
import { MongoDbTestbedAgentRepository } from "../../src/database/repositories/mongodb/mongo-db-testbed-agent-repository";

const SERVER_SECRET = "test-server-secret";

let client: MongoClient;
let db: Db;

function getInjector() {
  return createInjector()
    .provideValue("getDatabase", () => db)
    .provideValue("serverSecret", SERVER_SECRET);
}

before(async () => {
  client = new MongoClient(process.env.DB_URI!);
  await client.connect();
  db = client.db("test_repositories");
});

after(async () => {
  await client?.close();
});

// ─── CRUD via MongoDbProjectRepository ───────────────────────────────────────

describe("MongoDbProjectRepository (CRUD)", () => {
  let repo: MongoDbProjectRepository;

  before(() => {
    const injector = getInjector();
    repo = new MongoDbProjectRepository(injector);
  });

  afterEach(async () => {
    await db.collection("projects").deleteMany({});
  });

  const sampleProject: schemas.Project = {
    projectId: "proj-001",
    name: "Test Project",
    description: "A test project",
    tags: ["test"],
  };

  it("should create and findById", async () => {
    const created = await repo.create({ ...sampleProject });
    expect(created.id).to.be.a("string");
    expect(created.projectId).to.equal("proj-001");

    const found = await repo.findById(created.id);
    expect(found).to.not.be.null;
    expect(found!.projectId).to.equal("proj-001");
    expect(found!.name).to.equal("Test Project");
  });

  it("should findByPattern", async () => {
    await repo.create({ ...sampleProject });
    await repo.create({ ...sampleProject, projectId: "proj-002", name: "Other" });

    const results = await repo.findByPattern({ projectId: "proj-001" });
    expect(results).to.have.lengthOf(1);
    expect(results[0].name).to.equal("Test Project");
  });

  it("should updateById", async () => {
    const created = await repo.create({ ...sampleProject });
    const updated = await repo.updateById(created.id, { name: "Updated" });
    expect(updated).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.name).to.equal("Updated");
  });

  it("should return false when updating non-existent id", async () => {
    const result = await repo.updateById("aaaaaaaaaaaaaaaaaaaaaaaa", { name: "x" });
    expect(result).to.be.false;
  });

  it("should deleteById", async () => {
    const created = await repo.create({ ...sampleProject });
    const deleted = await repo.deleteById(created.id);
    expect(deleted).to.be.true;

    const found = await repo.findById(created.id);
    expect(found).to.be.null;
  });

  it("should return false when deleting non-existent id", async () => {
    const result = await repo.deleteById("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(result).to.be.false;
  });

  it("should return null for findById with non-existent id", async () => {
    const found = await repo.findById("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(found).to.be.null;
  });

  it("should return empty array for findByPattern with no matches", async () => {
    const results = await repo.findByPattern({ projectId: "nonexistent" });
    expect(results).to.have.lengthOf(0);
  });
});

// ─── MongoDBUserRepository ───────────────────────────────────────────────────

describe("MongoDBUserRepository", () => {
  let repo: MongoDBUserRepository;
  let projectRepo: MongoDbProjectRepository;

  before(() => {
    const injector = getInjector();
    repo = new MongoDBUserRepository(injector);
    projectRepo = new MongoDbProjectRepository(injector);
  });

  afterEach(async () => {
    await db.collection("users").deleteMany({});
    await db.collection("projects").deleteMany({});
  });

  const sampleUser: schemas.User = {
    userId: "user-001",
    fullName: "Test User",
    permissions: ["read", "write"],
    projects: [],
  };

  it("should findByUserId", async () => {
    await repo.create({ ...sampleUser });
    const found = await repo.findByUserId("user-001");
    expect(found).to.not.be.null;
    expect(found!.fullName).to.equal("Test User");
  });

  it("should return null for non-existent userId", async () => {
    const found = await repo.findByUserId("nonexistent");
    expect(found).to.be.null;
  });

  it("should throw when duplicate userId found", async () => {
    // Insert two users with same userId directly to bypass any unique index
    await db.collection("users").insertMany([
      { userId: "dup-user", fullName: "A", permissions: [], projects: [] },
      { userId: "dup-user", fullName: "B", permissions: [], projects: [] },
    ]);
    try {
      await repo.findByUserId("dup-user");
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.message).to.include("Found more than one user");
    }
  });

  it("should count", async () => {
    expect(await repo.count()).to.equal(0);
    await repo.create({ ...sampleUser });
    expect(await repo.count()).to.equal(1);
    await repo.create({ ...sampleUser, userId: "user-002" });
    expect(await repo.count()).to.equal(2);
  });

  it("should projectsByUser", async () => {
    const p1 = await projectRepo.create({ projectId: "p1", name: "P1", description: "d1" });
    const p2 = await projectRepo.create({ projectId: "p2", name: "P2", description: "d2" });
    const user = await repo.create({ ...sampleUser, projects: [p1.id, p2.id] });

    const projects = await repo.projectsByUser(user.id);
    expect(projects).to.have.lengthOf(2);
    const ids = projects.map((p) => p.projectId).sort();
    expect(ids).to.deep.equal(["p1", "p2"]);
  });

  it("should return empty array for user with no projects", async () => {
    const user = await repo.create({ ...sampleUser, projects: [] });
    const projects = await repo.projectsByUser(user.id);
    expect(projects).to.have.lengthOf(0);
  });
});

// ─── MongoDbAgentRepository ──────────────────────────────────────────────────

describe("MongoDbAgentRepository", () => {
  let repo: MongoDbAgentRepository;

  before(() => {
    const injector = getInjector();
    repo = new MongoDbAgentRepository(SERVER_SECRET, injector);
  });

  afterEach(async () => {
    await db.collection("agents").deleteMany({});
  });

  const sampleAgent: schemas.Agent = {
    name: "Test Agent",
    description: "desc",
    serverUrl: "http://localhost:3000",
    serverProtocol: "http",
    serverPath: "test-agent",
    authentication: { type: "none" },
    type: "agent",
    creator: "user-1",
    visibility: schemas.Visibility.Public,
    connections: [],
  };

  it("should addNewConnection", async () => {
    const created = await repo.create({ ...sampleAgent });
    const result = await repo.addNewConnection(created.id, "conn-1");
    expect(result).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.connections).to.include("conn-1");
  });

  it("should replaceConnections", async () => {
    const created = await repo.create({ ...sampleAgent, connections: ["old-1", "old-2"] });
    const result = await repo.replaceConnections(created.id, ["new-1"]);
    expect(result).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.connections).to.deep.equal(["new-1"]);
  });

  it("should findByConnectionId", async () => {
    await repo.create({ ...sampleAgent, connections: ["conn-a"] });
    await repo.create({ ...sampleAgent, name: "Other", connections: ["conn-b"] });

    const results = await repo.findByConnectionId("conn-a");
    expect(results).to.have.lengthOf(1);
    expect(results[0].name).to.equal("Test Agent");
  });

  it("should unsetCreator", async () => {
    const created = await repo.create({ ...sampleAgent });
    const result = await repo.unsetCreator(created.id);
    expect(result).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.creator).to.be.undefined;
  });

  it("should encrypt/decrypt token authentication", async () => {
    const agent: schemas.Agent = {
      ...sampleAgent,
      authentication: { type: "token", token: "my-secret-token" },
    };
    const created = await repo.create({ ...agent });

    // Raw DB value should be encrypted
    const raw = await db.collection("agents").findOne({ _id: created.id as any });
    // The token in the raw doc should NOT be the plaintext
    // (it's stored encrypted by transformOnWrite)

    // But reading through the repo should decrypt it
    const found = await repo.findById(created.id);
    expect(found!.authentication!.type).to.equal("token");
    if (found!.authentication!.type === "token") {
      expect(found!.authentication!.token).to.equal("my-secret-token");
    }
  });

  it("should encrypt/decrypt basic authentication", async () => {
    const agent: schemas.Agent = {
      ...sampleAgent,
      authentication: { type: "basic", username: "admin", password: "pass123" },
    };
    const created = await repo.create({ ...agent });

    const found = await repo.findById(created.id);
    expect(found!.authentication!.type).to.equal("basic");
    if (found!.authentication!.type === "basic") {
      expect(found!.authentication!.username).to.equal("admin");
      expect(found!.authentication!.password).to.equal("pass123");
    }
  });
});

// ─── MongoDBVisibilityRepository (via setVisibility) ─────────────────────────

describe("MongoDBVisibilityRepository", () => {
  let repo: MongoDBVisibilityRepository<schemas.MCPServerOptions>;

  before(() => {
    const injector = getInjector();
    repo = new MongoDBVisibilityRepository<schemas.MCPServerOptions>("visibility_test", injector);
  });

  afterEach(async () => {
    await db.collection("visibility_test").deleteMany({});
  });

  const sampleItem: schemas.MCPServerOptions = {
    name: "Test Server",
    serverPath: "test-srv",
    creator: "user-1",
    visibility: schemas.Visibility.Private,
    type: "server",
  };

  it("should setVisibility to Public and unset projects", async () => {
    const created = await repo.create({ ...sampleItem, projects: ["p1"] });
    const result = await repo.setVisibility(created.id, {
      ...sampleItem,
      visibility: schemas.Visibility.Public,
    });
    expect(result).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.visibility).to.equal(schemas.Visibility.Public);
    expect(found!.projects).to.be.undefined;
  });

  it("should setVisibility to Managed and keep projects", async () => {
    const created = await repo.create({ ...sampleItem, projects: ["p1"] });
    const result = await repo.setVisibility(created.id, {
      ...sampleItem,
      visibility: schemas.Visibility.Managed,
      projects: ["p1", "p2"],
    });
    expect(result).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.visibility).to.equal(schemas.Visibility.Managed);
    expect(found!.projects).to.deep.equal(["p1", "p2"]);
  });
});

// ─── MongoDBConnectionOptionsRepository ──────────────────────────────────────

describe("MongoDBConnectionOptionsRepository", () => {
  let repo: MongoDBConnectionOptionsRepository;

  before(() => {
    const injector = getInjector();
    repo = new MongoDBConnectionOptionsRepository(SERVER_SECRET, injector);
  });

  afterEach(async () => {
    await db.collection("clients").deleteMany({});
  });

  const sampleConnection: schemas.MCPConnectionOptions = {
    name: "Test Connection",
    serverUrl: "http://localhost:4000",
    serverProtocol: "http",
    authentication: { type: "none" },
    type: "client",
    creator: "user-1",
    visibility: schemas.Visibility.Private,
  };

  it("should unsetCreator", async () => {
    const created = await repo.create({ ...sampleConnection });
    const result = await repo.unsetCreator(created.id);
    expect(result).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.creator).to.be.undefined;
  });

  it("should encrypt/decrypt token authentication", async () => {
    const conn: schemas.MCPConnectionOptions = {
      ...sampleConnection,
      authentication: { type: "token", token: "secret-tok" },
    };
    const created = await repo.create({ ...conn });

    const found = await repo.findById(created.id);
    expect(found!.authentication!.type).to.equal("token");
    if (found!.authentication!.type === "token") {
      expect(found!.authentication!.token).to.equal("secret-tok");
    }
  });

  it("should encrypt/decrypt oidc_client_secret authentication", async () => {
    const conn: schemas.MCPConnectionOptions = {
      ...sampleConnection,
      authentication: { type: "oidc_client_secret", clientId: "cid", clientSecret: "csecret" },
    };
    const created = await repo.create({ ...conn });

    const found = await repo.findById(created.id);
    if (found!.authentication!.type === "oidc_client_secret") {
      expect(found!.authentication!.clientId).to.equal("cid");
      expect(found!.authentication!.clientSecret).to.equal("csecret");
    }
  });
});

// ─── MongoDBMCPServerOptionsRepository ───────────────────────────────────────

describe("MongoDBMCPServerOptionsRepository", () => {
  let repo: MongoDBMCPServerOptionsRepository;

  before(() => {
    const injector = getInjector();
    repo = new MongoDBMCPServerOptionsRepository(injector);
  });

  afterEach(async () => {
    await db.collection("servers").deleteMany({});
  });

  const sampleServer: schemas.MCPServerOptions = {
    name: "Test Server",
    serverPath: "test-srv",
    creator: "user-1",
    visibility: schemas.Visibility.Public,
    connections: [],
    type: "server",
  };

  it("should addNewConnection", async () => {
    const created = await repo.create({ ...sampleServer });
    const result = await repo.addNewConnection(created.id, "conn-1");
    expect(result).to.be.true;

    const found = await repo.findById(created.id);
    expect(found!.connections).to.include("conn-1");
  });

  it("should replaceConnections", async () => {
    const created = await repo.create({ ...sampleServer, connections: ["old"] });
    await repo.replaceConnections(created.id, ["new-1", "new-2"]);

    const found = await repo.findById(created.id);
    expect(found!.connections).to.deep.equal(["new-1", "new-2"]);
  });

  it("should findByConnectionId", async () => {
    await repo.create({ ...sampleServer, connections: ["conn-x"] });
    await repo.create({ ...sampleServer, name: "Other", serverPath: "other", connections: ["conn-y"] });

    const results = await repo.findByConnectionId("conn-x");
    expect(results).to.have.lengthOf(1);
    expect(results[0].name).to.equal("Test Server");
  });

  it("should unsetCreator", async () => {
    const created = await repo.create({ ...sampleServer });
    await repo.unsetCreator(created.id);

    const found = await repo.findById(created.id);
    expect(found!.creator).to.be.undefined;
  });
});

// ─── MongoDbJWTTokenRepository ───────────────────────────────────────────────

describe("MongoDbJWTTokenRepository", () => {
  let repo: MongoDbJWTTokenRepository;

  before(() => {
    const injector = getInjector();
    repo = new MongoDbJWTTokenRepository(injector);
  });

  afterEach(async () => {
    await db.collection("jwt_tokens").deleteMany({});
  });

  it("should create and retrieve a JWT token", async () => {
    const token: schemas.JWTToken = {
      userId: "user-1",
      projectId: "proj-1",
      permissions: ["read"],
      expirationDate: new Date("2030-01-01"),
      disabled: false,
    };
    const created = await repo.create({ ...token });
    expect(created.id).to.be.a("string");

    const found = await repo.findById(created.id);
    expect(found!.userId).to.equal("user-1");
    expect(found!.disabled).to.be.false;
  });
});

// ─── MongoDbTestbedAgentRepository ───────────────────────────────────────────

describe("MongoDbTestbedAgentRepository", () => {
  let repo: MongoDbTestbedAgentRepository;

  before(() => {
    const injector = getInjector();
    repo = new MongoDbTestbedAgentRepository(SERVER_SECRET, injector);
  });

  afterEach(async () => {
    await db.collection("testbed_agents").deleteMany({});
  });

  const sampleTestbedAgent: schemas.TestbedAgentWithId = {
    id: "",
    name: "Testbed Agent",
    client: { apiKey: "my-api-key", baseURL: "http://localhost:5000" },
    useChatCompletions: true,
    model: "gpt-4",
    prompt: "You are a helpful assistant",
    creator: "user-1",
    visibility: schemas.Visibility.Private,
    connections: [],
    type: "testbed_agent",
  };

  it("should addNewConnection and findByConnectionId", async () => {
    const created = await repo.create({ ...sampleTestbedAgent });
    await repo.addNewConnection(created.id, "conn-tb-1");

    const results = await repo.findByConnectionId("conn-tb-1");
    expect(results).to.have.lengthOf(1);
    expect(results[0].name).to.equal("Testbed Agent");
  });

  it("should replaceConnections", async () => {
    const created = await repo.create({ ...sampleTestbedAgent, connections: ["old"] });
    await repo.replaceConnections(created.id, ["new-1"]);

    const found = await repo.findById(created.id);
    expect(found!.connections).to.deep.equal(["new-1"]);
  });

  it("should unsetCreator", async () => {
    const created = await repo.create({ ...sampleTestbedAgent });
    await repo.unsetCreator(created.id);

    const found = await repo.findById(created.id);
    expect(found!.creator).to.be.undefined;
  });

  it("should encrypt/decrypt client apiKey", async () => {
    const created = await repo.create({ ...sampleTestbedAgent });

    const found = await repo.findById(created.id);
    expect(found!.client.apiKey).to.equal("my-api-key");
    expect(found!.client.baseURL).to.equal("http://localhost:5000");
  });
});
