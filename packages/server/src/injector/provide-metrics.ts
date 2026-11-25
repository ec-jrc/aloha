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

import { Injector, Scope } from "typed-inject";
import type { MetricsProvider } from "../metrics/metrics-provider";
import { NoopMetricsProvider } from "../metrics/noop";
import { PrometheusMetricsProvider } from "../metrics/prometheus";

/**
 * Factory that selects the metrics backend based on `metricsEnabled`.
 *
 * There is ALWAYS a MetricsProvider in the injector (mirroring the no-auth
 * provider pattern): when metrics are disabled a NoopMetricsProvider is used,
 * so instrumentation call sites never need to null-check and disabled
 * deployments incur no overhead or log spam.
 */
function metricsProviderFactory(
  metricsEnabled: boolean,
  metricsPrefix: string
): MetricsProvider {
  return metricsEnabled
    ? new PrometheusMetricsProvider(metricsPrefix)
    : new NoopMetricsProvider();
}
metricsProviderFactory.inject = ["metricsEnabled", "metricsPrefix"] as const;

/**
 * Provides the metrics backend as a singleton.
 *
 * The concrete implementation is Prometheus (via OpenTelemetry) when metrics
 * are enabled, or a no-op when disabled. Consumers depend only on the
 * `MetricsProvider` interface, so the backend can be swapped here without
 * touching instrumentation call sites.
 *
 * The provider is always registered; initialization happens in
 * `initMetricsProvider()` (called early in `server.ts`), and route mounting
 * in `initTelemetry()` (called from `express-setup.ts`) — both gated on
 * `metricsEnabled`.
 */
export function provideMetrics<
  T extends {
    metricsEnabled: boolean;
    metricsPrefix: string;
  },
>(injector: Injector<T>) {
  return injector.provideFactory(
    "metricsProvider",
    metricsProviderFactory,
    Scope.Singleton
  );
}
