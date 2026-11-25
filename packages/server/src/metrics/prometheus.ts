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
import express, { type Router } from "express";
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import { getLogger } from "../injector/provide-logger";
import type { MetricsProvider } from "./metrics-provider";

const logger = getLogger("METRICS");

/**
 * Maps the numeric A2A SDK v2 `TaskState` enum to the lowercase string label
 * used by the `a2a_task_status_total` Prometheus series. The SDK moved from a
 * string union (e.g. "submitted") to a proto-style numeric enum; the metric
 * must keep emitting the original human-readable labels so existing
 * dashboards/alerts and the Prometheus server continue to work.
 */
const TASK_STATE_LABEL: Record<TaskState, string> = {
  [TaskState.TASK_STATE_UNSPECIFIED]: "unspecified",
  [TaskState.TASK_STATE_SUBMITTED]: "submitted",
  [TaskState.TASK_STATE_WORKING]: "working",
  [TaskState.TASK_STATE_COMPLETED]: "completed",
  [TaskState.TASK_STATE_FAILED]: "failed",
  [TaskState.TASK_STATE_CANCELED]: "canceled",
  [TaskState.TASK_STATE_INPUT_REQUIRED]: "input-required",
  [TaskState.TASK_STATE_REJECTED]: "rejected",
  [TaskState.TASK_STATE_AUTH_REQUIRED]: "auth-required",
  [TaskState.UNRECOGNIZED]: "unrecognized",
};

function taskStateToLabel(state: TaskState): string {
  return TASK_STATE_LABEL[state] ?? "unrecognized";
}

/**
 * Default histogram bucket boundaries.
 * Covers fast health checks (10ms) through slow proxy/agent operations (30s).
 */
const DEFAULT_HISTOGRAM_BOUNDARIES = [
  0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

/**
 * Response-size histogram bucket boundaries (bytes).
 */
const RESPONSE_SIZE_BOUNDARIES = [
  256, 1024, 4096, 16384, 65536, 262144, 1048576,
];

/**
 * Prometheus MetricsProvider backed by `prom-client`.
 *
 * `prom-client` implements the Prometheus client model directly, which gives
 * us two things the OpenTelemetry JS SDK could not: `collectDefaultMetrics()`
 * for Node.js process metrics, and `Gauge.remove()` so that series for removed
 * or disabled connections truly disappear from the exposition (letting
 * Prometheus mark them stale) instead of being frozen at their last value.
 *
 * Consumers depend only on the `MetricsProvider` interface, so a different
 * backend (e.g. an OTLP exporter) can be swapped in via the injector without
 * touching any instrumentation call site.
 */
export class PrometheusMetricsProvider implements MetricsProvider {
  public static inject = ["metricsPrefix"] as const;

  private registry: Registry | null = null;

  // ─── Instruments ──────────────────────────────────────────────────────────

  // Connection & Uptime
  private connectionUp!: Gauge;
  private connectionTransitionsTotal!: Counter;
  private serverUp!: Gauge;
  private pingDuration!: Histogram;
  private hubConnections!: Gauge;

  // MCP Proxy
  private mcpRequestsTotal!: Counter;
  private mcpRequestDuration!: Histogram;
  private mcpToolCallDuration!: Histogram;
  private mcpSessions!: Gauge;

  // A2A Proxy
  private a2aRequestsTotal!: Counter;
  private a2aRequestDuration!: Histogram;
  private a2aTaskStatusTotal!: Counter;
  private a2aTasks!: Gauge;

  // Debug / Adoption
  private debugMcpRequestsTotal!: Counter;
  private debugA2aRequestsTotal!: Counter;
  private testbedExecutionsTotal!: Counter;

  // Auth
  private authFailuresTotal!: Counter;

  // Proxy Health
  private proxyUpstreamErrorsTotal!: Counter;
  private proxyResponseSizeBytes!: Histogram;

  // Catalogue Hygiene
  private connectionLastRequestTimestamp!: Gauge;

  private initialized = false;

  constructor(private readonly metricsPrefix: string) {}

  /** Returns true if init() has been called and instruments are ready. */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    const log = logger();
    if (this.initialized) {
      log.warn("MetricsProvider already initialized");
      return;
    }

    log.info(
      { prefix: this.metricsPrefix },
      "Initializing Prometheus metrics (prom-client)"
    );

    this.registry = new Registry();

    // Node.js process metrics (CPU, memory, event loop lag, GC, handles).
    collectDefaultMetrics({
      register: this.registry,
      prefix: this.metricsPrefix,
    });

    this.createInstruments();

    this.initialized = true;
    log.info("Metrics provider initialized");
  }

  getRouter(): Router {
    const router = express.Router();

    router.get("/", async (_req, res) => {
      if (!this.registry) {
        res.status(503).send("Metrics not initialized");
        return;
      }
      try {
        res.set("Content-Type", this.registry.contentType);
        res.end(await this.registry.metrics());
      } catch (e) {
        logger().error(e, "Failed to render metrics");
        res.status(500).end();
      }
    });

    return router;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async shutdown(): Promise<void> {
    logger().info("Shutting down metrics provider");
    if (this.initialized) {
      this.registry?.clear();
      this.registry = null;
      this.initialized = false;
    }
  }

  // ─── Connection & Uptime ────────────────────────────────────────────────────

  connectionState(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a",
    isUp: boolean
  ): void {
    if (!this.isReady("connection_up")) return;
    this.connectionUp.set(
      { connection_id: connectionId, name, type },
      isUp ? 1 : 0
    );
  }

  clearConnectionState(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a"
  ): void {
    if (!this.isReady("connection_up")) return;
    // Drop the series entirely so Prometheus marks it stale rather than
    // freezing it at its last value (used for disabled/removed connections).
    this.connectionUp.remove({ connection_id: connectionId, name, type });
    this.connectionLastRequestTimestamp.remove({
      connection_id: connectionId,
      name,
    });
  }

  connectionTransition(
    connectionId: string,
    name: string,
    type: "mcp" | "a2a",
    transition: "connected" | "disconnected" | "error"
  ): void {
    if (!this.isReady("connection_transitions_total")) return;
    this.connectionTransitionsTotal.inc({
      connection_id: connectionId,
      name,
      type,
      transition,
    });
  }

  serverState(serverId: string, serverPath: string, isUp: boolean): void {
    if (!this.isReady("server_up")) return;
    this.serverUp.set(
      { server_id: serverId, server_path: serverPath },
      isUp ? 1 : 0
    );
  }

  clearServerState(serverId: string, serverPath: string): void {
    if (!this.isReady("server_up")) return;
    this.serverUp.remove({ server_id: serverId, server_path: serverPath });
  }

  pingComplete(
    connectionId: string,
    type: "mcp" | "a2a",
    durationSec: number
  ): void {
    if (!this.isReady("ping_duration_seconds")) return;
    this.pingDuration.observe(
      { connection_id: connectionId, type },
      durationSec
    );
  }

  hubSummary(
    kind: "client" | "agent" | "server",
    online: number,
    total: number
  ): void {
    if (!this.isReady("hub_connections")) return;
    this.hubConnections.set({ kind, state: "online" }, online);
    this.hubConnections.set({ kind, state: "total" }, total);
  }

  // ─── MCP Proxy ─────────────────────────────────────────────────────────────

  mcpRequestComplete(
    serverPath: string,
    operation: string,
    user: string,
    durationSec: number,
    success: boolean
  ): void {
    if (!this.isReady("mcp_requests_total")) return;
    this.mcpRequestsTotal.inc({
      server_path: serverPath,
      operation,
      status: success ? "success" : "error",
      user,
    });
    this.mcpRequestDuration.observe(
      { server_path: serverPath, operation },
      durationSec
    );
  }

  mcpToolCallComplete(
    serverPath: string,
    toolName: string,
    durationSec: number
  ): void {
    if (!this.isReady("mcp_tool_call_duration_seconds")) return;
    this.mcpToolCallDuration.observe(
      { server_path: serverPath, tool_name: toolName },
      durationSec
    );
  }

  mcpSessionDelta(serverPath: string, delta: number): void {
    if (!this.isReady("mcp_sessions_active")) return;
    this.mcpSessions.inc({ server_path: serverPath }, delta);
  }

  // ─── A2A Proxy ─────────────────────────────────────────────────────────────

  a2aRequestComplete(
    agentPath: string,
    operation: string,
    user: string,
    durationSec: number,
    success: boolean
  ): void {
    if (!this.isReady("a2a_requests_total")) return;
    this.a2aRequestsTotal.inc({
      agent_path: agentPath,
      operation,
      status: success ? "success" : "error",
      user,
    });
    this.a2aRequestDuration.observe(
      { agent_path: agentPath, operation },
      durationSec
    );
  }

  a2aTaskStatus(agentPath: string, taskStatus: TaskState): void {
    if (!this.isReady("a2a_task_status_total")) return;
    this.a2aTaskStatusTotal.inc({
      agent_path: agentPath,
      task_status: taskStateToLabel(taskStatus),
    });
  }

  a2aTasksActive(agentPath: string, count: number): void {
    if (!this.isReady("a2a_tasks_active")) return;
    this.a2aTasks.set({ agent_path: agentPath }, count);
  }

  // ─── Debug / Adoption ──────────────────────────────────────────────────────

  debugMcpRequest(
    connectionId: string,
    operation: string,
    success: boolean
  ): void {
    if (!this.isReady("debug_mcp_requests_total")) return;
    this.debugMcpRequestsTotal.inc({
      connection_id: connectionId,
      operation,
      status: success ? "success" : "error",
    });
  }

  debugA2aRequest(agentId: string, operation: string, success: boolean): void {
    if (!this.isReady("debug_a2a_requests_total")) return;
    this.debugA2aRequestsTotal.inc({
      agent_id: agentId,
      operation,
      status: success ? "success" : "error",
    });
  }

  testbedExecution(testbedAgentId: string, success: boolean): void {
    if (!this.isReady("testbed_executions_total")) return;
    this.testbedExecutionsTotal.inc({
      testbed_agent_id: testbedAgentId,
      status: success ? "success" : "error",
    });
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  authFailure(
    method: string,
    reason: "expired" | "invalid" | "forbidden" | "not_found"
  ): void {
    if (!this.isReady("auth_failures_total")) return;
    this.authFailuresTotal.inc({ method, reason });
  }

  // ─── Proxy Health ──────────────────────────────────────────────────────────

  proxyUpstreamError(
    serverPath: string,
    type: "mcp" | "a2a",
    errorKind:
      | "timeout"
      | "connection_refused"
      | "auth_failure"
      | "upstream_error"
  ): void {
    if (!this.isReady("proxy_upstream_errors_total")) return;
    this.proxyUpstreamErrorsTotal.inc({
      server_path: serverPath,
      type,
      error_kind: errorKind,
    });
  }

  proxyResponseSize(
    serverPath: string,
    type: "mcp" | "a2a",
    sizeBytes: number
  ): void {
    if (!this.isReady("proxy_response_size_bytes")) return;
    this.proxyResponseSizeBytes.observe(
      { server_path: serverPath, type },
      sizeBytes
    );
  }

  // ─── Catalogue Hygiene ─────────────────────────────────────────────────────

  connectionRequestReceived(connectionId: string, name: string): void {
    if (!this.isReady("connection_last_request_timestamp")) return;
    this.connectionLastRequestTimestamp.set(
      { connection_id: connectionId, name },
      Date.now() / 1000
    );
  }

  /**
   * Guard for all observation methods. Returns false if metrics are NOT ready,
   * logging a warning every time so operators notice in deployment logs.
   */
  private isReady(metric: string): boolean {
    if (this.initialized) return true;
    logger().warn(
      { metric },
      "MetricsProvider: observation dropped — init() was not called. " +
        "Set METRICS_ENABLED=true or check startup sequence."
    );
    return false;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private createInstruments(): void {
    const registers = [this.registry!];
    const p = this.metricsPrefix;

    // Connection & Uptime
    this.connectionUp = new Gauge({
      name: `${p}connection_up`,
      help: "Connection liveness: 1 if connected, 0 if not",
      labelNames: ["connection_id", "name", "type"],
      registers,
    });
    this.connectionTransitionsTotal = new Counter({
      name: `${p}connection_transitions_total`,
      help: "Connection state changes",
      labelNames: ["connection_id", "name", "type", "transition"],
      registers,
    });
    this.serverUp = new Gauge({
      name: `${p}server_up`,
      help: "Server reachability: 1 if online, 0 if not",
      labelNames: ["server_id", "server_path"],
      registers,
    });
    this.pingDuration = new Histogram({
      name: `${p}ping_duration_seconds`,
      help: "Ping latency per connection",
      labelNames: ["connection_id", "type"],
      buckets: DEFAULT_HISTOGRAM_BOUNDARIES,
      registers,
    });
    this.hubConnections = new Gauge({
      name: `${p}hub_connections`,
      help: "Hub-level summary counts by kind and state",
      labelNames: ["kind", "state"],
      registers,
    });

    // MCP Proxy
    this.mcpRequestsTotal = new Counter({
      name: `${p}mcp_requests_total`,
      help: "Total MCP requests through the proxy",
      labelNames: ["server_path", "operation", "status", "user"],
      registers,
    });
    this.mcpRequestDuration = new Histogram({
      name: `${p}mcp_request_duration_seconds`,
      help: "Duration of MCP proxy requests",
      labelNames: ["server_path", "operation"],
      buckets: DEFAULT_HISTOGRAM_BOUNDARIES,
      registers,
    });
    this.mcpToolCallDuration = new Histogram({
      name: `${p}mcp_tool_call_duration_seconds`,
      help: "Duration of individual MCP tool calls",
      labelNames: ["server_path", "tool_name"],
      buckets: DEFAULT_HISTOGRAM_BOUNDARIES,
      registers,
    });
    this.mcpSessions = new Gauge({
      name: `${p}mcp_sessions_active`,
      help: "Count of active MCP sessions per server",
      labelNames: ["server_path"],
      registers,
    });

    // A2A Proxy
    this.a2aRequestsTotal = new Counter({
      name: `${p}a2a_requests_total`,
      help: "Total A2A requests through the proxy",
      labelNames: ["agent_path", "operation", "status", "user"],
      registers,
    });
    this.a2aRequestDuration = new Histogram({
      name: `${p}a2a_request_duration_seconds`,
      help: "Duration of A2A proxy requests",
      labelNames: ["agent_path", "operation"],
      buckets: DEFAULT_HISTOGRAM_BOUNDARIES,
      registers,
    });
    this.a2aTaskStatusTotal = new Counter({
      name: `${p}a2a_task_status_total`,
      help: "A2A task status transitions",
      labelNames: ["agent_path", "task_status"],
      registers,
    });
    this.a2aTasks = new Gauge({
      name: `${p}a2a_tasks_active`,
      help: "Count of in-flight A2A tasks per agent",
      labelNames: ["agent_path"],
      registers,
    });

    // Debug / Adoption
    this.debugMcpRequestsTotal = new Counter({
      name: `${p}debug_mcp_requests_total`,
      help: "Direct MCP calls from the browser inspector",
      labelNames: ["connection_id", "operation", "status"],
      registers,
    });
    this.debugA2aRequestsTotal = new Counter({
      name: `${p}debug_a2a_requests_total`,
      help: "Direct A2A interactions from the browser",
      labelNames: ["agent_id", "operation", "status"],
      registers,
    });
    this.testbedExecutionsTotal = new Counter({
      name: `${p}testbed_executions_total`,
      help: "Testbed agentic loop executions",
      labelNames: ["testbed_agent_id", "status"],
      registers,
    });

    // Auth
    this.authFailuresTotal = new Counter({
      name: `${p}auth_failures_total`,
      help: "Authentication failures",
      labelNames: ["method", "reason"],
      registers,
    });

    // Proxy Health
    this.proxyUpstreamErrorsTotal = new Counter({
      name: `${p}proxy_upstream_errors_total`,
      help: "Upstream proxy failures",
      labelNames: ["server_path", "type", "error_kind"],
      registers,
    });
    this.proxyResponseSizeBytes = new Histogram({
      name: `${p}proxy_response_size_bytes`,
      help: "Response payload sizes for proxied requests",
      labelNames: ["server_path", "type"],
      buckets: RESPONSE_SIZE_BOUNDARIES,
      registers,
    });

    // Catalogue Hygiene
    this.connectionLastRequestTimestamp = new Gauge({
      name: `${p}connection_last_request_timestamp`,
      help: "Unix timestamp of last proxied request per connection",
      labelNames: ["connection_id", "name"],
      registers,
    });

    logger().debug("All metric instruments created");
  }
}
