# Metrics

Aloha exposes operational metrics at `GET /metrics` in [Prometheus exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/). The instrumentation is built on [prom-client](https://github.com/siimon/prom-client) behind a `MetricsProvider` interface, so you can swap the backend for any compatible telemetry system (OTLP, Datadog, Grafana Cloud, etc.) without changing application code.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `METRICS_ENABLED` | `true` | Set to `false` to disable metrics entirely |
| `METRICS_PREFIX` | `aloha_` | Prefix prepended to all metric names |

When `METRICS_ENABLED=false`, no telemetry is initialized and the `/metrics` endpoint is not mounted.

## Setting Up Prometheus

### Using Docker Compose (included)

The repository ships a `docker-compose.yaml` with a Prometheus service pre-configured. You need to provide a `prometheus.yml` file at the project root:

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "aloha"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["localhost:3000"]
```

Then start the stack:

```bash
docker-compose up prometheus
```

Prometheus will be available at `http://localhost:9090` and will scrape Aloha's `/metrics` endpoint every 15 seconds.

### Standalone Prometheus

If you run Prometheus separately, add a scrape job pointing to your Aloha instance:

```yaml
scrape_configs:
  - job_name: "aloha"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["<aloha-host>:<port>"]
```

### OpenShift / Kubernetes

In cluster deployments, use a `ServiceMonitor` or `PodMonitor` CRD (if you have the Prometheus Operator) or annotate the pod:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3000"
    prometheus.io/path: "/metrics"
```

## Available Metrics

All metric names are prefixed with `aloha_` (configurable via `METRICS_PREFIX`).

### Connection & Uptime

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `connection_up` | Gauge | `connection_id`, `name`, `type` | 1 if connected, 0 if not |
| `connection_transitions_total` | Counter | `connection_id`, `name`, `type`, `transition` | State change count |
| `server_up` | Gauge | `server_id`, `server_path` | MCP server reachability |
| `ping_duration_seconds` | Histogram | `connection_id`, `type` | Ping latency |
| `hub_connections` | Gauge | `kind`, `state` | Summary counts by kind (client/agent/server) and state (online/total) |

**Example queries:**
```promql
# Uptime percentage over 7 days
avg_over_time(aloha_connection_up{name="my-server"}[7d]) * 100

# Connections currently down
aloha_connection_up == 0
```

### MCP Proxy

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `mcp_requests_total` | Counter | `server_path`, `operation`, `status`, `user` | Total MCP requests |
| `mcp_request_duration_seconds` | Histogram | `server_path`, `operation` | Request latency |
| `mcp_tool_call_duration_seconds` | Histogram | `server_path`, `tool_name` | Per-tool latency |
| `mcp_sessions_active` | Gauge | `server_path` | Active session count |

### A2A Proxy

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `a2a_requests_total` | Counter | `agent_path`, `operation`, `status`, `user` | Total A2A requests |
| `a2a_request_duration_seconds` | Histogram | `agent_path`, `operation` | Request latency |
| `a2a_task_status_total` | Counter | `agent_path`, `task_status` | Task lifecycle transitions |
| `a2a_tasks_active` | Gauge | `agent_path` | In-flight task count |

### Debug & Adoption

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `debug_mcp_requests_total` | Counter | `connection_id`, `operation`, `status` | Browser MCP inspector usage |
| `debug_a2a_requests_total` | Counter | `agent_id`, `operation`, `status` | Browser A2A chat usage |
| `testbed_executions_total` | Counter | `testbed_agent_id`, `status` | Testbed agentic loop runs |

### Authentication

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `auth_failures_total` | Counter | `method`, `reason` | Authentication failures |

`method`: `JWT`, `OIDC`, or plugin name. `reason`: `expired`, `invalid`, `forbidden`, `not_found`.

### Proxy Health

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `proxy_upstream_errors_total` | Counter | `server_path`, `type`, `error_kind` | Upstream failures |
| `proxy_response_size_bytes` | Histogram | `server_path`, `type` | Response payload sizes |

### Catalogue Hygiene

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `connection_last_request_timestamp` | Gauge | `connection_id`, `name` | Unix timestamp of last request |

**Example query — unused connections (no requests in 30 days):**
```promql
aloha_connection_last_request_timestamp < (time() - 30*24*3600)
```

## Using a Different Backend

The instrumentation is backend-agnostic via the `MetricsProvider` interface. To export to a different backend:

1. Implement a custom `MetricsProvider` (e.g., wrapping an OTLP exporter or Datadog client)
2. Register it in the dependency injector instead of `PrometheusMetricsProvider`

The `MetricsProvider` interface is defined in `packages/server/src/metrics/metrics-provider.ts`. The concrete implementation is swapped via the dependency injector in `packages/server/src/metrics/init-telemetry.ts`.

When metrics are disabled (`METRICS_ENABLED=false`), a `NoopMetricsProvider` is injected that silently drops all observations with zero overhead.

## Histogram Bucket Boundaries

Duration histograms use: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]` seconds — covering fast health checks (10ms) through slow LLM tool calls (30s).

Response size histograms use: `[256, 1024, 4096, 16384, 65536, 262144, 1048576]` bytes.
