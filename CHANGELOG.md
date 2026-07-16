# CHANGELOG

## [4.1.0] - 15 Jul 2026

### Added

- Global MCP hub that aggregates tools across all connected clients, served at `/api/mcp/hub`, with permissions enforced before any tool is executed and only the latest client version used
- A2A connected-client registry exposed at `:serverPath/registry/v1` for both servers and MCP agents
- A2A agent card display in the UI, and the ability for testbed agents to call A2A agents
- Reusable search box across clients, agents, and testbed agents, with a clear (X) icon and debounced filtering
- Agent workflow state persisted in the database
- Maintenance scripts for the plugin `extras` field

### Changed

- Tokens and passwords are now redacted from logs
- Clients are now sorted by name and version number
- Authorization model for shared resources: only an admin or the owner may operate on or create new versions of a client or agent, and admins can change the ownership and access of any client or agent
- Toggle to show or hide the connection section
- OIDC connections use dedicated per-connection clients
- Aloha performs a token exchange after dynamic client registration

### Fixed

- Fixed a crash triggered by federated users
- Fixed the A2A discovery URL and received-message rendering issues

## [4.0.0] - 17 Jun 2026

### Added

- Global MCP hub exposed alongside each server: tools are discoverable and invocable through `discover_tools` / `invoke_tool` meta-tools, with tool names prefixed by their server (`serverName.toolName`) and fuzzy relevance ranking (minisearch)
- Client versioning: create and manage multiple versions of a client, with a version indicator in the client list and version details in the UI
- Runtime plugin platform for both frontend and backend
- New `client-workflow` feature plugin implementing client lifecycle states
- Client and agent uptime tracking
- `aloha-perf` load-testing tool

### Changed

- Major dependency upgrade
- Tool lists are prefixed with the server name

### Fixed

- Fixed a user update bug and non-running tests
- Restored server protocol and authentication type when editing
- Avoid reallocating the edit dialog during re-render
- Fixed wildcard (`*`) tool search and a ranking edge case
- Security: fixed an issue in creator assignment, an information leak in testbed agents, and default session secret handling

## [3.0.2] - 04 Apr 2026

### Added

- Updated the MCP inspector components to the latest version

### Fixed

- Resolved bug with session management in MCP proxy to greatly improve management
- Resolved issues with session reflection in MCP proxy
- Improved the changelog

## [3.0.1] - 01 Apr 2026

### Fixed

- Refactored MCP server to run initialisation and closing in parallel
- Refactored MCP server connections management to allow multiple requests in parallel

## [3.0.0] - 05 Mar 2026

### Added

- Added support to A2A protocol for Agent To Agent communication
- Added disabling functionalities for features
- Added end to end test infrastructure, and added first tests
- Added AI generated unit tests for the server package

### Fixed

- Extended timeout for long-running requests
- On authentication failure, MCP servers now correctly return error code 401
- Correctly assigned logging level to debug for non-critical logs
- Graphical fixes and clean-up

## [2.0.0] - 21 Oct 2025

### Added

- Improve documentation
- Added OIDC identity propagation service and registrar with Keycloak implementation
- Added OIDC login functionality
- Added support for showing tags in entities list and details
- Added support for Docker-compose
- Updating libraries
- Added support for e2e tests (work in progress)

### Fixed

- Fixed client tool dialog and added see more/see less for description
- Fixed unauthorized server response
- Fixed token table reload render
- Fixed client default tab activation
- Fixed testbed agent visualization
- Fixed empty unknown user permissions variable value
- Fixed access servers requiring server read/write permissions
- Fixed max height and scrollable area
- Fixed tool call with client read permission
- Fixed allocation of creator and visibility components
- Updated MCPClient visibility when changed on the entity
- Fixed no_proxy environment variable injection
- Fixed build issues
- Fixed cards in Agents to prevent overflow
- Fixed gifs in README and content placement

### Changed

- Removed console log
- Improved JWT authentication logging
- Showing user permissions as a nice list
- Showing project names instead of "managed"
- Improved user permissions handling
- Improved project list display
- Improved drag-and-drop area handling
- Improved client list display

### Removed

- Removed hardcoded strings
- Removed duplicate function
- Removed jsonwebtoken dependency
- Removed unused code

## [1.2.0] - 14 Aug 2025

### Added

- Implemented 'Testbed Agents'

## [1.1.0] - 13 Jun 2025

### Added

- Added support for 'MCP Agents'
- Added authorization to MCP clients, servers, agents
- Added integration for MCP streamableHTTP protocol
- Added prometheus metrics

## [1.0.0] - 13 May 2025

- Initial release
