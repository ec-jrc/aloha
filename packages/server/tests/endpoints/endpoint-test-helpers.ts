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

import sinon from "sinon";
import express, { Express, Router } from "express";
import session from "express-session";
import { authentication_strategy } from "aloha-shared";
import { setAuthPlugins } from "../../src/middleware/authorise";
import { replaceInjector, injector } from "../../src/injector/injector";

// ── Mock Factories ──────────────────────────────────────────────────────────

export function createMockCache() {
  return {
    get: sinon.stub().callsFake(async (_key: string, vp?: () => Promise<unknown>) => vp ? vp() : null),
    put: sinon.stub().callsFake((_key: string, value: unknown) => value),
    del: sinon.stub().returns(true),
    clear: sinon.stub(),
    size: sinon.stub().returns(0),
    hits: sinon.stub().returns(0),
    misses: sinon.stub().returns(0),
  };
}

export function createMockRepository() {
  return {
    findByPattern: sinon.stub().resolves([]),
    findById: sinon.stub().resolves(null),
    create: sinon.stub().callsFake(async (item: any) => ({ ...item, id: "new-id" })),
    updateById: sinon.stub().resolves(true),
    deleteById: sinon.stub().resolves(true),
  };
}

export function createMockVisibilityRepository() {
  return {
    ...createMockRepository(),
    setVisibility: sinon.stub().resolves(true),
    findByConnectionId: sinon.stub().resolves([]),
    addNewConnection: sinon.stub().resolves(true),
    replaceConnections: sinon.stub().resolves(true),
    unsetCreator: sinon.stub().resolves(true),
  };
}

export function createMockUserRepository() {
  return {
    ...createMockRepository(),
    findByUserId: sinon.stub().resolves(null),
    projectsByUser: sinon.stub().resolves([]),
    count: sinon.stub().resolves(1),
  };
}

export function createMockMcpManager() {
  return {
    getConnections: sinon.stub().returns([]),
    getConnection: sinon.stub().returns(null),
    getServers: sinon.stub().returns([]),
    getServer: sinon.stub().returns(null),
    getServerByPath: sinon.stub().returns(null),
    getStartDate: sinon.stub().returns(new Date()),
    createConnection: sinon.stub().returns(null),
    createServer: sinon.stub(),
    removeConnection: sinon.stub().resolves(),
    removeServer: sinon.stub().resolves(),
    reloadConnection: sinon.stub().resolves(),
    reloadServer: sinon.stub().resolves(),
    testConnection: sinon.stub().resolves(),
  };
}

export function createMockMetricsProvider() {
  return {
    init: sinon.stub(),
    getRouter: sinon.stub().returns(express.Router()),
    shutdown: sinon.stub().resolves(),
    connectionState: sinon.stub(),
    clearConnectionState: sinon.stub(),
    connectionTransition: sinon.stub(),
    serverState: sinon.stub(),
    clearServerState: sinon.stub(),
    pingComplete: sinon.stub(),
    hubSummary: sinon.stub(),
    mcpRequestComplete: sinon.stub(),
    mcpToolCallComplete: sinon.stub(),
    mcpSessionDelta: sinon.stub(),
    a2aRequestComplete: sinon.stub(),
    a2aTaskStatus: sinon.stub(),
    a2aTasksActive: sinon.stub(),
    debugMcpRequest: sinon.stub(),
    debugA2aRequest: sinon.stub(),
    testbedExecution: sinon.stub(),
    authFailure: sinon.stub(),
    proxyUpstreamError: sinon.stub(),
    proxyResponseSize: sinon.stub(),
    connectionRequestReceived: sinon.stub(),
  };
}

// ── Default admin user ──────────────────────────────────────────────────────

export const adminUser: authentication_strategy.UserPrincipal = {
  id: "user-1",
  userId: "admin-user",
  displayName: "Admin",
  permissions: Object.values(authentication_strategy.Permissions),
  provider: "test",
};

export const regularUser: authentication_strategy.UserPrincipal = {
  id: "user-2",
  userId: "regular-user",
  displayName: "Regular",
  permissions: [],
  provider: "test",
};

export const adminDbUser = {
  id: "user-1",
  userId: "admin-user",
  fullName: "Admin",
  permissions: Object.values(authentication_strategy.Permissions),
  disabled: false,
};

export const regularDbUser = {
  id: "user-2",
  userId: "regular-user",
  fullName: "Regular",
  permissions: [],
  disabled: false,
};

// ── Auth plugin that grants all permissions ─────────────────────────────────

const grantAllAuthPlugin: authentication_strategy.AuthenticationStrategy = {
  init: async () => {},
  getAuthenticationMiddleware: async () => (_req, _res, next) => next(),
  checkPermissions: async () => true,
  login: async () => (_req, res) => { res.send(); },
  logout: async () => (_req, _res, next) => next(),
  getInfo: async () => ({ provider: "test" }),
};

// ── Mock logger ─────────────────────────────────────────────────────────────

export function createMockLogger() {
  const logger: any = {
    info: sinon.stub(),
    debug: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    child: sinon.stub().callsFake(() => logger),
  };
  return logger;
}

// ── OIDC mock factories ─────────────────────────────────────────────────────

export function createMockOidcRegistrar() {
  return {
    registerClient: sinon.stub().resolves(),
    unregisterClient: sinon.stub().resolves(),
  };
}

export function createMockOidcIdpService() {
  return {
    getClientRegistration: sinon.stub().resolves(undefined),
  };
}

export interface OidcMocks {
  registrar: ReturnType<typeof createMockOidcRegistrar>;
  idpService: ReturnType<typeof createMockOidcIdpService>;
}

// ── Injector setup ──────────────────────────────────────────────────────────

export interface MockDependencies {
  fetchCache: ReturnType<typeof createMockCache>;
  emptyCache: ReturnType<typeof createMockCache>;
  usersCache: ReturnType<typeof createMockCache>;
  userProjectsCache: ReturnType<typeof createMockCache>;
  jwtCache: ReturnType<typeof createMockCache>;
  userRepository: ReturnType<typeof createMockUserRepository>;
  projectRepository: ReturnType<typeof createMockRepository>;
  tokenRepository: ReturnType<typeof createMockRepository>;
  connectionOptionsRepository: ReturnType<typeof createMockVisibilityRepository>;
  serverOptionsRepository: ReturnType<typeof createMockVisibilityRepository>;
  agentRepository: ReturnType<typeof createMockVisibilityRepository>;
  mcpManager: ReturnType<typeof createMockMcpManager>;
  metricsProvider: ReturnType<typeof createMockMetricsProvider>;
  rootLogger: ReturnType<typeof createMockLogger>;
}

export function createMockDependencies(): MockDependencies {
  return {
    fetchCache: createMockCache(),
    emptyCache: createMockCache(),
    usersCache: createMockCache(),
    userProjectsCache: createMockCache(),
    jwtCache: createMockCache(),
    userRepository: createMockUserRepository(),
    projectRepository: createMockRepository(),
    tokenRepository: createMockRepository(),
    connectionOptionsRepository: createMockVisibilityRepository(),
    serverOptionsRepository: createMockVisibilityRepository(),
    agentRepository: createMockVisibilityRepository(),
    mcpManager: createMockMcpManager(),
    metricsProvider: createMockMetricsProvider(),
    rootLogger: createMockLogger(),
  };
}

let originalInjector: any;

export function setupMockInjector(deps: MockDependencies, oidcMocks?: OidcMocks) {
  originalInjector = injector();
  const mockInjector = {
    resolve: sinon.stub().callsFake((key: string) => {
      if (key in deps) return (deps as any)[key];
      if (key === "oidcAlohaTokenSetProvider") return null;
      if (key === "oidcIdentityPropagationService")
        return oidcMocks ? Promise.resolve(oidcMocks.idpService) : null;
      if (key === "oidcIdentityPropagationRegistrar")
        return oidcMocks ? Promise.resolve(oidcMocks.registrar) : null;
      throw new Error(`Unknown dependency: ${key}`);
    }),
  };
  replaceInjector(mockInjector as any);
  return mockInjector;
}

export function restoreInjector() {
  if (originalInjector) {
    replaceInjector(originalInjector);
  }
}

// ── Express app builder ─────────────────────────────────────────────────────

export function createTestApp(router: Router, {
  user,
  basePath = "",
}: { user?: authentication_strategy.UserPrincipal; basePath?: string } = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: true }));

  // Inject user into session if provided
  if (user) {
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }

  app.use(basePath, router);
  return app;
}

// ── Setup / teardown helpers ────────────────────────────────────────────────

export function setupAuthPlugins() {
  setAuthPlugins([grantAllAuthPlugin]);
}

export function teardownAuthPlugins() {
  setAuthPlugins([]);
}
