# ALOHA Project Documentation

This document provides an overview of the ALOHA project.

<!-- product.md -->

# Product Overview

## Project Name

ALOHA (AI Logical Orchestrator Hub for Agents)

## Purpose

ALOHA is a centralized hub for managing and interconnecting data and AI agents. Built on the Model Context Protocol (MCP) and Agent-to-Agent (A2A) protocol, it enables seamless communication between applications, MCP servers, and AI agents, enhancing tool discoverability and interoperability across AI agent systems.

## Target Audience

- **AI/ML Developers**: Building agentic systems that need to connect to multiple tools and services
- **Enterprise Teams**: Organizations requiring centralized management of MCP infrastructure
- **Agent Developers**: Teams testing and debugging MCP server and A2A agent implementations
- **System Integrators**: Engineers deploying proxy servers for simplified agent-tool connections

## Key Features

### Multi-Protocol Agent Connectivity

- **MCP Protocol**: Connect agents to MCP servers for tool access and resource management
- **A2A Protocol**: Connect agents to other AI agents for inter-agent communication and task delegation
- Unified management interface for both protocol types
- Seamless switching between connection modes per agent

### MCP Server Management

- Connect to both local and remote MCP servers
- Support for multiple authentication strategies:
  - Basic authentication
  - Bearer token
  - OAuth2 (planned)
  - Custom plugins (extendable architecture)
- Test MCP server responses directly from the browser
- Debug and improve tool implementations

### A2A Agent Integration

- Register and manage A2A-compatible agents
- Send tasks to remote agents and receive streaming responses
- Support for A2A artifacts and task status tracking
- Real-time event streaming for agent interactions

### Proxy Servers

- Deploy proxy servers to simplify connections between agents/applications and tools
- MCP proxy for tool aggregation
- A2A proxy for agent-to-agent routing
- Single endpoint management with identity propagation
- Reduce boilerplate code by centralizing authentication and routing

### Agent Development & Testing

- Run agentic loops directly in the browser using OpenAI-compatible endpoints
- Test MCP server and A2A agent performance with real workflows
- Browser-based testing environment for rapid iteration
- Visual event streaming for debugging agent interactions

### Authentication & Identity Propagation

- Plugin-based authentication system
- OIDC integration with Keycloak
- Dynamic client registration
- Identity propagation across services
- Permission-based access control

### Database Flexibility

- MongoDB as primary database
- PostgreSQL as alternative database option
- Configurable via environment variables

## Business Objectives

- **Simplify Agent Integration**: Reduce complexity of connecting agents to MCP servers and other agents via A2A
- **Accelerate Development**: Provide out-of-the-box testing and debugging tools for both protocols
- **Enable Enterprise Adoption**: Support enterprise authentication and identity management
- **Foster Interoperability**: Standardize on MCP and A2A protocols for tool discovery and agent communication

## Success Metrics

- Number of MCP servers successfully connected
- Number of A2A agents integrated
- Agent execution success rate across both protocols
- Developer time saved in testing and debugging
- Enterprise deployments with OIDC integration

<!-- tech.md -->

# Technology Stack

## Programming Languages

- **TypeScript 5.9+**: Primary language for all packages
- **JavaScript**: Build configurations and some tooling

## Frontend Stack

### Core Framework

- **React 19.1**: UI library
- **React Router 7.8**: Client-side routing
- **Vite 7.1**: Build tool and dev server

### UI Components & Styling

- **TailwindCSS 4.1**: Utility-first CSS framework
- **Radix UI**: Headless component primitives (dialogs, dropdowns, tooltips, etc.)
- **shadcn/ui**: Pre-built accessible components
- **Lucide React**: Icon library
- **Motion (Framer Motion)**: Animation library

### State Management & Data

- **React Hook Form 7.62**: Form state management
- **Zod 4.x**: Schema validation
- **RxJS 7.8**: Reactive programming for real-time updates

### Code Display

- **Prism.js**: Syntax highlighting
- **react-simple-code-editor**: Code editing components

## Backend Stack

### Core Framework

- **Node.js**: Runtime environment
- **Express 5.1**: Web server framework
- **TypeScript (ES Modules)**: `"type": "module"` in package.json

### Database

- **MongoDB 6.19**: Primary database option
- **PostgreSQL 8.x**: Alternative database option (via pg driver)
- **connect-mongo**: Session store for Express (MongoDB)
- **connect-pg-simple**: Session store for Express (PostgreSQL)

### Authentication & Security

- **openid-client 6.8**: OpenID Connect client
- **jose 6.1**: JWT/JWE/JWS implementation
- **express-session 1.18**: Session middleware
- **cookie-parser**: Cookie handling

### MCP & Agent Integration

- **@modelcontextprotocol/sdk 1.26**: Model Context Protocol implementation
- **@a2a-js/sdk 0.3**: Agent-to-Agent protocol implementation (see [A2A Protocol Documentation](../.kiro/knowledge/a2a.md))
- **@openai/agents 0.4**: OpenAI agent framework (client-side)
- **openai 6.x**: OpenAI API client (client-side)

### Utilities

- **typed-inject 5.0**: Dependency injection
- **Pino 9.9**: Structured logging
- **node-cache 5.1**: In-memory caching
- **Zod 4.x**: Runtime type validation
- **dotenv 17.2**: Environment variable management

### Proxy & Networking

- **http-proxy-middleware 3.0**: HTTP proxy for MCP servers
- **eventsource 4.0**: Server-Sent Events client
- **node-fetch-native**: Fetch API polyfill
- **undici**: Modern HTTP client

## Shared Package

**aloha-shared**: Common types, schemas, and utilities shared between client and server

## Development Tools

### Monorepo Management

- **pnpm**: Package manager with workspace support
- **Lerna 8.2**: Monorepo orchestration tool
- **pnpm workspaces**: Defined in `pnpm-workspace.yaml`

### Code Quality

- **ESLint 9.35**: Linting (with TypeScript ESLint)
- **Prettier 3.7**: Code formatting with plugins:
  - prettier-plugin-organize-imports
  - prettier-plugin-organize-class-members
  - prettier-plugin-sort-members
- **React functional components**: React components must be defined as functions, and exported as default

### Testing

- **Mocha 11.7**: Test framework (server unit tests)
- **Chai 5.2**: Assertion library
- **Sinon 21.0**: Mocking and stubbing
- **mongodb-memory-server**: In-memory MongoDB for tests
- **c8**: Code coverage reporting
- **Vitest 4.x**: Test framework (e2e tests)
- **Puppeteer 24.x**: Browser automation for e2e tests

### Build Tools

- **TypeScript Compiler**: Type checking and compilation
- **tsc-alias**: Path alias resolution for builds
- **tsx**: TypeScript execution for development

## Deployment

### Containerization

- **Docker**: Container runtime
- **Docker Compose**: Multi-container orchestration
- Dockerfiles for both public and internal deployments

### Orchestration

- **Kubernetes**: Production deployment target
- **Helm**: Configuration via `values.yaml`

### Monitoring

- **Prometheus**: Metrics collection
- **express-prometheus-middleware**: Express metrics exporter

## Environment Configuration

### Required Services

- **MongoDB**: Database (default: `mongodb://127.0.0.1:27017/ALOHA`)
- **PostgreSQL**: Alternative database (configurable via `DATABASE_TYPE`)
- **Keycloak**: OIDC identity provider (optional, for enterprise auth)

### Key Environment Variables

- `MONGODB_URI`: MongoDB connection string
- `DATABASE_TYPE`: Database selection (`mongodb` or `postgres`)
- `SERVER_PORT`: Backend HTTP port (default: 3000)
- `VITE_SERVER_PORT`: Frontend dev server port (default: 5173)
- `OIDC_ENABLED`: Enable OIDC authentication
- `OIDC_ISSUER_URL`: Keycloak realm URL
- `OIDC_CLIENT_ID`: OIDC client identifier
- `OIDC_JWKS`: JSON Web Key Set for token validation
- `SERVER_SECRET`: Server authentication secret
- `CLIENT_SECRET`: Client authentication secret

## Plugin Architecture

### Authentication Plugins

- Custom authentication strategies via `AuthenticationStrategy` interface
- Loaded from `AUTHENTICATION_PLUGIN` environment variable

### Identity Propagation Plugins

- Custom OIDC identity propagation services
- Loaded from `OIDC_IDENTITY_PROPAGATION_SERVICE_PATH`
- Custom client registrars via `OIDC_IDENTITY_PROPAGATION_REGISTRAR_PATH`

## Technical Constraints

- **ES Modules**: All packages use `"type": "module"`
- **TypeScript Strict Mode**: Enabled for type safety
- **Browser Compatibility**: Modern browsers (ES2020+)
- **Node.js Version**: Compatible with Node.js 18+

<!-- structure.md -->

# Project Structure

## Repository Organization

ALOHA is organized as a **monorepo** using pnpm workspaces and Lerna for orchestration.

### Top-Level Structure

```
aloha/
├── packages/           # Main application packages
│   ├── client/        # React frontend
│   ├── server/        # Express backend
│   ├── aloha-shared/  # Shared types and utilities
│   └── e2e-tests/     # End-to-end integration tests
├── plugins/           # Extensible plugin modules
│   └── (authentication plugins are provided at runtime)
├── docs/             # Documentation and assets

├── pnpm-workspace.yaml
├── lerna.json
└── package.json      # Root workspace configuration
```

## Package Structure

### Client Package (`packages/client/`)

```
client/
├── src/
│   ├── app/              # Page components organized by feature
│   │   ├── agents/       # Agent management pages (MCP & A2A)
│   │   ├── clients/      # MCP client pages
│   │   ├── servers/      # MCP server pages
│   │   ├── testbed-agents/ # Agent testing pages
│   │   ├── users/        # User management
│   │   ├── projects/     # Project management
│   │   ├── jwt-tokens/   # Token management
│   │   ├── home/         # Homepage
│   │   ├── errors/       # Error pages (401, 403, 404)
│   │   ├── changelog/    # Changelog display
│   │   ├── license/      # License information
│   │   └── routing.tsx   # Route definitions
│   ├── components/       # Reusable UI components
│   │   ├── ui/          # Base UI components (shadcn/ui)
│   │   └── chat/        # Chat-related components
│   ├── services/        # API client services
│   ├── hooks/           # Custom React hooks
│   ├── context/         # React context providers
│   ├── utils/           # Utility functions
│   │   ├── a2a-*.ts     # A2A protocol utilities
│   │   └── testbed-*.ts # Testbed utilities
│   ├── lib/             # Library code
│   ├── mcp-inspector/   # MCP debugging tools
│   ├── assets/          # Static assets
│   ├── main.tsx         # Application entry point
│   └── index.css        # Global styles
├── public/              # Static public assets
├── vite.config.ts       # Vite configuration
├── tailwind.config.js   # Tailwind configuration
└── package.json
```

### Server Package (`packages/server/`)

```
server/
├── src/
│   ├── endpoints/       # Express route handlers
│   │   ├── clients.ts
│   │   ├── servers.ts
│   │   ├── agents.ts
│   │   ├── testbed-agents.ts
│   │   ├── users.ts
│   │   ├── tokens.ts
│   │   ├── projects.ts
│   │   ├── hub.ts
│   │   ├── user-info.ts
│   │   ├── servers-proxy-mcp.ts
│   │   ├── servers-proxy-a2a.ts
│   │   ├── servers-proxy-utils.ts
│   │   ├── testbed-agents-proxy.ts
│   │   ├── express-setup.ts
│   │   └── utils.ts
│   ├── middleware/      # Express middleware
│   │   ├── oidc/       # OIDC-related middleware
│   │   ├── authorise.ts
│   │   ├── jwt-authentication.ts
│   │   ├── oidc-authentication.ts
│   │   └── no-authentication.ts
│   ├── connections/     # Protocol implementations
│   │   ├── mcp-client.ts
│   │   ├── mcp-server.ts
│   │   ├── mcp-manager.ts
│   │   ├── mcp-server-setup.ts
│   │   ├── a2a-client.ts
│   │   ├── a2a-server.ts
│   │   ├── remote-client.ts
│   │   └── auth-utils.ts
│   ├── database/       # Database layer
│   │   └── repositories/
│   │       ├── interfaces/  # Repository interfaces
│   │       ├── mongodb/     # MongoDB implementations
│   │       └── postgres/    # PostgreSQL implementations
│   ├── injector/       # Dependency injection
│   │   ├── injector.ts
│   │   ├── provide-database.ts
│   │   ├── provide-session-store.ts
│   │   ├── provide-mcp-manager.ts
│   │   ├── provide-oidc.ts
│   │   ├── provide-env-vars.ts
│   │   ├── provide-caches.ts
│   │   ├── provide-logger.ts
│   │   └── provide-logger-instance.ts
│   ├── cache/          # Caching layer
│   ├── utils/          # Utility functions
│   └── server.ts       # Application entry point
├── tests/              # Test files
│   ├── endpoints/      # Endpoint tests
│   ├── connections/    # Connection/protocol tests
│   ├── database/       # Database repository tests
│   ├── injector/       # Dependency injection tests
│   ├── middleware/     # Middleware tests
│   ├── setup.js        # Test setup
│   └── db-setup.js     # Database test setup
├── docs/               # Server-specific documentation
├── dist/               # Compiled output
└── package.json
```

### Shared Package (`packages/aloha-shared/`)

```
aloha-shared/
├── src/               # Shared TypeScript code
│   ├── types/        # Common type definitions
│   ├── schemas/      # Zod validation schemas
│   └── utils/        # Shared utilities
├── dist/             # CommonJS build output
├── dist-module/      # ES Module build output
└── package.json
```

### E2E Tests Package (`packages/e2e-tests/`)

```
e2e-tests/
├── src/              # Test source files
│   └── tests/        # Integration test files
├── tsconfig.json
└── package.json
```

## Naming Conventions

### Files and Directories
- **kebab-case**: For all file and directory names
  - Examples: `agent-detail.tsx`, `mcp-client.ts`, `user-info.ts`
- **React Components**: Use kebab-case filenames with `.tsx` extension
  - Examples: `agent-edit-dialog.tsx`, `client-list-page.tsx`

### Code Conventions
- **PascalCase**: React components, TypeScript interfaces, types, classes
  ```typescript
  export function AgentDetailPage() { }
  interface ClientMetadata { }
  class MCPManager { }
  ```
- **camelCase**: Functions, variables, methods
  ```typescript
  const getUserInfo = () => { }
  const tokenSet = await getAlohaTokenSet();
  ```
- **SCREAMING_SNAKE_CASE**: Constants and environment variables
  ```typescript
  const PROVIDER_NAME = "KEYCLOAK-IDPS";
  process.env.MONGODB_URI
  ```

## Import Patterns

### Module System
- **ES Modules**: All packages use `"type": "module"` in package.json
- **File Extensions**: Always include `.js` extension in imports (TypeScript compiles `.ts` to `.js`)
  ```typescript
  import { injector } from "../../injector/injector.js";
  ```

### Import Organization
Imports are automatically organized by Prettier plugins in this order:
1. External dependencies
2. Internal absolute imports
3. Relative imports (parent directories first, then siblings)

Example:
```typescript
import express from "express";
import { z } from "zod";

import { injector } from "../../injector/injector.js";
import { getLogger } from "../../injector/provide-logger.js";

import { MCPManager } from "./mcp-manager.js";
```

### Path Aliases
- **Server**: Uses `@/` alias for `src/` directory (configured in tsconfig.json)
- **Client**: Uses relative imports primarily

### Workspace Dependencies
- Shared package linked via `"aloha-shared": "link:../aloha-shared"` in package.json

## Architectural Patterns

### Dependency Injection (Server)
- Uses `typed-inject` library
- Centralized in `src/injector/injector.ts`
- Provider pattern: `provide-*.ts` files register dependencies
- Resolution: `injector().resolve("dependencyName")`

Example:
```typescript
import { injector } from "./injector/injector.js";

const logger = injector().resolve("logger");
const db = injector().resolve("database");
```

### Repository Pattern (Server)
- Interface definitions in `database/repositories/interfaces/`
- MongoDB implementations in `database/repositories/mongodb/`
- PostgreSQL implementations in `database/repositories/postgres/`
- Injected via dependency injection
- Database type selected via `DATABASE_TYPE` environment variable

### Middleware Chain (Server)
- Authentication middleware: `jwt-authentication.ts`, `oidc-authentication.ts`, `no-authentication.ts`
- Authorization middleware: `authorise.ts`
- Applied per-route in endpoint files

### Component Organization (Client)
- **Pages**: In `app/` directory, suffixed with `-page.tsx`
- **Dialogs**: Suffixed with `-dialog.tsx`
- **Forms**: Suffixed with `-form.tsx`
- **Cards**: Suffixed with `-card.tsx`
- **Reusable Components**: In `components/` directory

### Service Layer (Client)
- API clients in `services/` directory
- One file per resource: `clients.ts`, `servers.ts`, `agents.ts`, etc.
- Export functions that return Promises

## Configuration Files

### TypeScript
- **Root**: `tsconfig.json` (base configuration)
- **Client**: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- **Server**: `tsconfig.json`, `tsconfig.build.json`
- **Shared**: `tsconfig.json`, `tsconfig-module.json`
- **E2E Tests**: `tsconfig.json`

### Build & Dev Tools
- **Vite**: `vite.config.ts` (client)
- **ESLint**: `eslint.config.js` (per package)
- **Prettier**: `.prettierrc` (root)
- **Lerna**: `lerna.json` (root)

### Environment
- `.env` files at root and package levels
- `.env.example` templates provided
- Never commit actual `.env` files

## Build Output

### Client
- **Development**: Served by Vite dev server (port 5173)
- **Production**: Built to `dist/` directory

### Server
- **Development**: Run with `tsx watch` (hot reload)
- **Production**: Compiled to `dist/` directory with `tsc` and `tsc-alias`

### Shared
- **CommonJS**: Built to `dist/` (for server compatibility)
- **ES Modules**: Built to `dist-module/` (for client compatibility)

## Plugin System

### Authentication Plugins
- Implement `AuthenticationStrategy` interface from `aloha-shared`
- Export as default from module
- Specify path in `AUTHENTICATION_PLUGIN` environment variable

### OIDC Plugins
- **Identity Propagation Service**: Implement `IdentityPropagationService` interface
- **Client Registrar**: Implement `IdentityPropagationServiceRegistrar` interface
- Dynamically loaded via environment variables

## Testing Structure

### Server Unit Tests
- Located in `packages/server/tests/`
- Run with Mocha
- Use `mongodb-memory-server` for database tests
- Configuration in `.mocharc.json`
- Coverage reporting with c8 (`.c8rc.json`)
- Test organization mirrors source structure:
  - `tests/endpoints/` - API endpoint tests
  - `tests/connections/` - Protocol implementation tests
  - `tests/database/` - Repository tests
  - `tests/injector/` - Dependency injection tests
  - `tests/middleware/` - Middleware tests

### E2E Integration Tests
- Located in `packages/e2e-tests/`
- Run with Vitest
- Use Puppeteer for browser automation
- Configuration in package.json scripts

## Documentation

- **Root README.md**: Project overview and quick start
- **Package READMEs**: Package-specific documentation
- **DOCKER.md**: Docker deployment guide
- **CHANGELOG.md**: Version history
- **Server docs/**: Detailed OIDC and Keycloak setup guides
- **.kiro/knowledge/**: Protocol documentation (A2A, A2A rendering)

