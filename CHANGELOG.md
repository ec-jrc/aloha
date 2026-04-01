# CHANGELOG

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
