-- ALOHA PostgreSQL Schema Initialization
-- Run this script against your PostgreSQL database before starting the server
-- with DATABASE_TYPE=postgresql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- MAIN TABLES
-- ============================================================================

-- projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "projectId" TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT []
);

-- users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "userId" TEXT NOT NULL UNIQUE,
    "fullName" TEXT NOT NULL,
    permissions TEXT [] NOT NULL,
    disabled BOOLEAN
);

-- clients (MCPConnectionOptions)
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    description TEXT,
    "serverUrl" TEXT NOT NULL,
    "serverProtocol" TEXT NOT NULL,
    authentication JSONB,
    type TEXT NOT NULL DEFAULT 'client',
    creator UUID REFERENCES users (id) ON DELETE SET NULL,
    disabled BOOLEAN,
    visibility TEXT NOT NULL,
    tags TEXT []
);

-- servers (MCPServerOptions)
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    description TEXT,
    "serverPath" TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'server',
    creator UUID REFERENCES users (id) ON DELETE SET NULL,
    disabled BOOLEAN,
    visibility TEXT NOT NULL,
    tags TEXT []
);

-- agents (Agent) — merges connection + server fields
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    description TEXT,
    "serverUrl" TEXT NOT NULL,
    "serverProtocol" TEXT NOT NULL,
    authentication JSONB,
    "serverPath" TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'agent',
    creator UUID REFERENCES users (id) ON DELETE SET NULL,
    disabled BOOLEAN,
    visibility TEXT NOT NULL,
    tags TEXT []
);

-- jwt_tokens
CREATE TABLE IF NOT EXISTS jwt_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "userId" UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    "projectId" UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    permissions TEXT [] NOT NULL,
    "expirationDate" TIMESTAMP NOT NULL,
    disabled BOOLEAN NOT NULL
);

-- testbed_agents
CREATE TABLE IF NOT EXISTS testbed_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    client JSONB NOT NULL,
    "useChatCompletions" BOOLEAN NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'testbed_agent',
    creator UUID REFERENCES users (id) ON DELETE SET NULL,
    disabled BOOLEAN,
    visibility TEXT NOT NULL,
    tags TEXT []
);

-- ============================================================================
-- JUNCTION TABLES (for many-to-many relationships with FK constraints)
-- ============================================================================

-- users <-> projects
CREATE TABLE IF NOT EXISTS user_to_projects (
    "userId" UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    "projectId" UUID NOT NULL REFERENCES projects (id),
    PRIMARY KEY ("userId", "projectId")
);

-- clients <-> projects
CREATE TABLE IF NOT EXISTS client_to_projects (
    "clientId" UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
    "projectId" UUID NOT NULL REFERENCES projects (id),
    PRIMARY KEY ("clientId", "projectId")
);

-- servers <-> clients (connections)
CREATE TABLE IF NOT EXISTS server_to_clients (
    "serverId" UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    "clientId" UUID NOT NULL,
    PRIMARY KEY ("serverId", "clientId")
);

-- servers <-> projects
CREATE TABLE IF NOT EXISTS server_to_projects (
    "serverId" UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    "projectId" UUID NOT NULL REFERENCES projects (id),
    PRIMARY KEY ("serverId", "projectId")
);

-- agents <-> clients (connections)
CREATE TABLE IF NOT EXISTS agent_to_clients (
    "agentId" UUID NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
    "clientId" UUID NOT NULL,
    PRIMARY KEY ("agentId", "clientId")
);

-- agents <-> projects
CREATE TABLE IF NOT EXISTS agent_to_projects (
    "agentId" UUID NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
    "projectId" UUID NOT NULL REFERENCES projects (id),
    PRIMARY KEY ("agentId", "projectId")
);

-- testbed_agents <-> clients (connections)
CREATE TABLE IF NOT EXISTS testbed_agent_to_clients (
    "testbedAgentId" UUID NOT NULL REFERENCES testbed_agents (id) ON DELETE CASCADE,
    "clientId" UUID NOT NULL,
    PRIMARY KEY ("testbedAgentId", "clientId")
);

-- testbed_agents <-> projects
CREATE TABLE IF NOT EXISTS testbed_agent_to_projects (
    "testbedAgentId" UUID NOT NULL REFERENCES testbed_agents (id) ON DELETE CASCADE,
    "projectId" UUID NOT NULL REFERENCES projects (id),
    PRIMARY KEY ("testbedAgentId", "projectId")
);