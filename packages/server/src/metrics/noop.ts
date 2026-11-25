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

import express, { type Router } from "express";
import type { MetricsProvider } from "./metrics-provider";
import { TaskState } from "@a2a-js/sdk";

// Every observation method below intentionally ignores its (typed,
// documented) parameters — that is the entire point of a no-op provider.
// Signatures are kept fully typed to match `MetricsProvider` so call sites
// stay type-checked even when metrics are disabled.
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * No-op MetricsProvider used when metrics are disabled (METRICS_ENABLED=false).
 *
 * Mirrors the no-auth provider pattern: there is ALWAYS a MetricsProvider in
 * the injector, so instrumentation call sites never need to null-check. When
 * metrics are turned off, every observation is a cheap no-op — no
 * initialization, no log spam, no overhead — and the /metrics route reports
 * that metrics are disabled.
 */
export class NoopMetricsProvider implements MetricsProvider {
  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    // Intentionally empty — metrics are disabled.
  }

  getRouter(): Router {
    const router = express.Router();
    router.get("/", (_req, res) => {
      res.status(404).send("Metrics are disabled (METRICS_ENABLED=false)");
    });
    return router;
  }

  async shutdown(): Promise<void> {
    // Nothing to flush.
  }

  // ─── Connection & Uptime ────────────────────────────────────────────────────

  connectionState(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a",
    isUp: boolean
  ): void {}

  clearConnectionState(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a"
  ): void {}

  connectionTransition(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a",
    transition: "connected" | "disconnected" | "error"
  ): void {}

  serverState(serverId: string, serverPath: string, isUp: boolean): void {}

  clearServerState(serverId: string, serverPath: string): void {}

  pingComplete(
    connectionId: string,
    type: "mcp" | "a2a",
    durationSec: number
  ): void {}

  hubSummary(
    kind: "client" | "agent" | "server",
    online: number,
    total: number
  ): void {}

  // ─── MCP Proxy ─────────────────────────────────────────────────────────────

  mcpRequestComplete(
    serverPath: string,
    operation: string,
    user: string,
    durationSec: number,
    success: boolean
  ): void {}

  mcpToolCallComplete(
    serverPath: string,
    toolName: string,
    durationSec: number
  ): void {}

  mcpSessionDelta(serverPath: string, delta: number): void {}

  // ─── A2A Proxy ─────────────────────────────────────────────────────────────

  a2aRequestComplete(
    agentPath: string,
    operation: string,
    user: string,
    durationSec: number,
    success: boolean
  ): void {}

  a2aTaskStatus(agentPath: string, taskStatus: TaskState): void {}

  a2aTasksActive(agentPath: string, count: number): void {}

  // ─── Debug / Adoption ──────────────────────────────────────────────────────

  debugMcpRequest(
    connectionId: string,
    operation: string,
    success: boolean
  ): void {}

  debugA2aRequest(agentId: string, operation: string, success: boolean): void {}

  testbedExecution(testbedAgentId: string, success: boolean): void {}

  // ─── Auth ──────────────────────────────────────────────────────────────────

  authFailure(
    method: string,
    reason: "expired" | "invalid" | "forbidden" | "not_found"
  ): void {}

  // ─── Proxy Health ──────────────────────────────────────────────────────────

  proxyUpstreamError(
    serverPath: string,
    type: "mcp" | "a2a",
    errorKind:
      | "timeout"
      | "connection_refused"
      | "auth_failure"
      | "upstream_error"
  ): void {}

  proxyResponseSize(
    serverPath: string,
    type: "mcp" | "a2a",
    sizeBytes: number
  ): void {}

  // ─── Catalogue Hygiene ─────────────────────────────────────────────────────

  connectionRequestReceived(connectionId: string, name: string): void {}
}
