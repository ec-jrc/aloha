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

import type { Express } from "express";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";

const logger = getLogger("TELEMETRY");

/**
 * Initializes the metrics provider (creates the registry and all
 * instruments). Must be called before anything that records observations —
 * notably `mcpServerStartup()`'s first ping cycle, which otherwise runs
 * before Express (and `initTelemetry`) is even set up, silently dropping
 * every observation from server startup.
 *
 * Safe to call once; `MetricsProvider.init()` is idempotent (logs and
 * no-ops on a second call).
 *
 * Gated on the `METRICS_ENABLED` env var (defaults to true).
 */
export function initMetricsProvider(): void {
  const log = logger();
  const metricsEnabled = injector().resolve("metricsEnabled");

  if (!metricsEnabled) {
    log.info(
      "Metrics disabled (METRICS_ENABLED=false) — skipping metrics provider initialization"
    );
    return;
  }

  injector().resolve("metricsProvider").init();
}

/**
 * Mounts the `/metrics` endpoint on the given Express app.
 *
 * Expects the metrics provider to already be initialized via
 * `initMetricsProvider()` (called early in `server.ts`, before
 * `mcpServerStartup()`).
 *
 * Gated on the `METRICS_ENABLED` env var (defaults to true).
 */
export function initTelemetry(app: Express): void {
  const log = logger();
  const metricsEnabled = injector().resolve("metricsEnabled");

  if (!metricsEnabled) {
    log.info("Metrics disabled (METRICS_ENABLED=false) — skipping telemetry initialization");
    return;
  }

  const metricsProvider = injector().resolve("metricsProvider");
  app.use("/metrics", metricsProvider.getRouter());
  log.info("Telemetry initialized — metrics available at /metrics");
}
