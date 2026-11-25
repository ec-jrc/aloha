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

import { TaskState } from "@a2a-js/sdk";
import type { Router } from "express";

/**
 * Provider-agnostic metrics interface for the ALOHA server.
 *
 * Implementations may use Prometheus (via OpenTelemetry), OTLP, or any other
 * telemetry backend. Application code depends only on this interface — the
 * backend can be swapped without changing any instrumentation call sites.
 */
export interface MetricsProvider {
  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Initialize the metrics backend (create provider, exporter, instruments). */
  init(): void;

  /** Return an Express Router that exposes metrics endpoints (e.g. GET /metrics). */
  getRouter(): Router;

  /** Gracefully shut down, flushing any pending metric data. */
  shutdown(): Promise<void>;

  // ─── Connection & Uptime ────────────────────────────────────────────────────

  /** Record a connection's current state after a ping cycle. */
  connectionState(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a",
    isUp: boolean
  ): void;

  /**
   * Drop a connection's liveness series entirely (disabled or removed
   * connection). The series disappears from the exposition so Prometheus marks
   * it stale, rather than freezing it at its last value.
   */
  clearConnectionState(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a"
  ): void;

  /** Record a connection state transition (connected/disconnected/error). */
  connectionTransition(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a",
    transition: "connected" | "disconnected" | "error"
  ): void;

  /** Record a server's current reachability state. */
  serverState(serverId: string, serverPath: string, isUp: boolean): void;

  /** Drop a server's reachability series entirely (removed server). */
  clearServerState(serverId: string, serverPath: string): void;

  /** Record the duration of a ping to a connection. */
  pingComplete(
    connectionId: string,
    type: "mcp" | "a2a",
    durationSec: number
  ): void;

  /** Update hub-level summary counts. */
  hubSummary(
    kind: "client" | "agent" | "server",
    online: number,
    total: number
  ): void;

  // ─── MCP Proxy ─────────────────────────────────────────────────────────────

  /** Record a completed MCP proxy request. */
  mcpRequestComplete(
    serverPath: string,
    operation: string,
    user: string,
    durationSec: number,
    success: boolean
  ): void;

  /** Record the duration of an individual tool call. */
  mcpToolCallComplete(
    serverPath: string,
    toolName: string,
    durationSec: number
  ): void;

  /** Adjust the count of active MCP sessions for a server by a delta (+1/-1). */
  mcpSessionDelta(serverPath: string, delta: number): void;

  // ─── A2A Proxy ─────────────────────────────────────────────────────────────

  /** Record a completed A2A proxy request. */
  a2aRequestComplete(
    agentPath: string,
    operation: string,
    user: string,
    durationSec: number,
    success: boolean
  ): void;

  /** Record an A2A task status transition. */
  a2aTaskStatus(agentPath: string, taskStatus: TaskState): void;

  /** Update the count of active A2A tasks for an agent. */
  a2aTasksActive(agentPath: string, count: number): void;

  // ─── Debug / Adoption ──────────────────────────────────────────────────────

  /** Record a debug MCP request from the browser inspector. */
  debugMcpRequest(
    connectionId: string,
    operation: string,
    success: boolean
  ): void;

  /** Record a debug A2A interaction from the browser. */
  debugA2aRequest(agentId: string, operation: string, success: boolean): void;

  /** Record a testbed agent execution. */
  testbedExecution(testbedAgentId: string, success: boolean): void;

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /** Record an authentication failure. */
  authFailure(
    method: string,
    reason: "expired" | "invalid" | "forbidden" | "not_found"
  ): void;

  // ─── Proxy Health ──────────────────────────────────────────────────────────

  /** Record an upstream proxy error. */
  proxyUpstreamError(
    serverPath: string,
    type: "mcp" | "a2a",
    errorKind:
      | "timeout"
      | "connection_refused"
      | "auth_failure"
      | "upstream_error"
  ): void;

  /** Record the response size of a proxied request. */
  proxyResponseSize(
    serverPath: string,
    type: "mcp" | "a2a",
    sizeBytes: number
  ): void;

  // ─── Catalogue Hygiene ─────────────────────────────────────────────────────

  /** Record that a connection just received a proxied request. */
  connectionRequestReceived(connectionId: string, name: string): void;
}
