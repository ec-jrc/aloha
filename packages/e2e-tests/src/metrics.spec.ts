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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Process,
  sleep,
  startMcpEverythingServerProcess,
  startServerProcess,
} from "./utils/integration-test-support";
import { getRandomString } from "./utils/test-ui-utils";

/**
 * E2E verification checkpoint for the Prometheus metrics pipeline
 * (Task 2.3, aloha#136).
 *
 * Boots the REAL server (via `startIntegrationTestEnvironment`), connects a
 * REAL MCP server (`@modelcontextprotocol/server-everything`) through the
 * actual `/api/client` and `/api/server` endpoints, waits for a live ping
 * cycle, then scrapes the real `GET /metrics` endpoint over HTTP exactly as
 * Prometheus would. If this test passes, the full pipeline — ping cycle →
 * instrument → registry → HTTP exposition — is proven end-to-end, and all
 * subsequent domain metrics (Epics 3-5) can be added with confidence.
 */

/** Minimal Prometheus text-exposition parser: name{labels} value */
function parseExposition(text: string) {
  const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
  const samples: {
    name: string;
    labels: Record<string, string>;
    value: number;
  }[] = [];

  const lineRe = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(\S+)$/;

  for (const line of lines) {
    const match = lineRe.exec(line.trim());
    if (!match) {
      throw new Error(`Malformed exposition line: "${line}"`);
    }
    const [, name, , labelStr, valueStr] = match;
    const labels: Record<string, string> = {};
    if (labelStr) {
      const labelRe = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
      let m: RegExpExecArray | null;
      while ((m = labelRe.exec(labelStr)) !== null) {
        labels[m[1]!] = m[2]!;
      }
    }
    samples.push({ name: name!, labels, value: Number(valueStr) });
  }
  return samples;
}

describe("[M] Metrics", () => {
  let serverProcess: Process;
  let mcpEverything: Process;
  let baseUrl: string;
  let headers: Record<string, string>;
  let clientId: string;
  let serverId: string;
  let serverPath: string;

  beforeAll(async () => {
    // No browser/Vite needed — this is a pure API-level test against the
    // real server process and a real MCP server, exactly what Prometheus
    // itself would see when scraping /metrics.
    serverProcess = await startServerProcess();
    baseUrl = `http://localhost:${serverProcess.port}`;

    // 0. Start a real MCP server to connect through the hub.
    mcpEverything = await startMcpEverythingServerProcess();

    // Login to get a session cookie (no-auth e2e mode).
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      redirect: "manual",
    });
    const setCookie = loginRes.headers.get("set-cookie");
    const cookie = setCookie?.split(";")[0] ?? "";
    headers = { "Content-Type": "application/json", Cookie: cookie };

    // 1. Register a client connection pointing at the real MCP server.
    const clientRes = await fetch(`${baseUrl}/api/client/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "metrics-test-client-" + getRandomString(),
        serverUrl: `http://localhost:${mcpEverything.port}/mcp`,
        serverProtocol: "http",
        type: "client",
        authentication: { type: "none" },
        visibility: "public",
        creator: "no-auth-user",
      }),
    });
    expect(clientRes.ok).toBe(true);
    const clientSseText = await clientRes.text();
    const clientIdMatch = clientSseText.match(/"id"\s*:\s*"([^"]+)"/);
    expect(clientIdMatch).not.toBeNull();
    clientId = clientIdMatch![1]!;

    // Wait for the ping service to pick up the new connection and connect it.
    await sleep(3000);

    // 2. Register a server (hub-side) so aloha_server_up has a subject too.
    serverPath = "metricssvr" + getRandomString(6);
    const serverRes = await fetch(`${baseUrl}/api/server/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "metrics-test-server-" + getRandomString(),
        serverPath,
        type: "server",
        visibility: "public",
        creator: "no-auth-user",
      }),
    });
    expect(serverRes.status).toBe(204);

    const serverListRes = await fetch(`${baseUrl}/api/server/`, { headers });
    const servers = (await serverListRes.json()) as Array<{
      id: string;
      serverPath: string;
    }>;
    const server = servers.find((s) => s.serverPath === serverPath);
    expect(server).toBeDefined();
    serverId = server!.id;

    // Connect the client to the server so it has an active session too.
    const connectRes = await fetch(
      `${baseUrl}/api/server/${serverId}/_connect/${clientId}`,
      { method: "POST", headers }
    );
    expect(connectRes.status).toBe(204);

    // Let at least one more full ping cycle run (interval is 5s) so
    // gauges/counters/histograms reflect the connected state.
    await sleep(6000);
  }, 60000);

  afterAll(async () => {
    await mcpEverything?.stop();
    await serverProcess?.stop();
  });

  it("serves a valid, parseable Prometheus exposition format at /metrics", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/plain");

    const body = await res.text();
    expect(() => parseExposition(body)).not.toThrow();
  });

  it("reports aloha_connection_up for the connected MCP client", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const samples = parseExposition(await res.text());

    const connectionUp = samples.find(
      (s) => s.name === "aloha_connection_up" && s.labels.connection_id === clientId
    );
    expect(connectionUp, "aloha_connection_up sample not found").toBeDefined();
    expect(connectionUp!.labels.type).toBe("mcp");
    expect(connectionUp!.value).toBe(1);
  });

  it("increments aloha_connection_transitions_total on the connect transition", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const samples = parseExposition(await res.text());

    const transitions = samples.filter(
      (s) =>
        s.name === "aloha_connection_transitions_total" &&
        s.labels.connection_id === clientId &&
        s.labels.transition === "connected"
    );
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions[0]!.value).toBeGreaterThanOrEqual(1);
  });

  it("reports aloha_server_up reflecting the registered server's reachability", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const samples = parseExposition(await res.text());

    const serverUp = samples.find(
      (s) => s.name === "aloha_server_up" && s.labels.server_id === serverId
    );
    expect(serverUp, "aloha_server_up sample not found").toBeDefined();
    expect(serverUp!.labels.server_path).toBe(serverPath);
    expect(serverUp!.value).toBe(1);
  });

  it("records observations in aloha_ping_duration_seconds for the connection", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const samples = parseExposition(await res.text());

    const countSample = samples.find(
      (s) =>
        s.name === "aloha_ping_duration_seconds_count" &&
        s.labels.connection_id === clientId
    );
    expect(countSample, "ping duration histogram count not found").toBeDefined();
    expect(countSample!.value).toBeGreaterThan(0);
  });

  it("keeps aloha_hub_connections totals consistent with individual connection_up gauges", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const samples = parseExposition(await res.text());

    const hubTotalClients = samples.find(
      (s) =>
        s.name === "aloha_hub_connections" &&
        s.labels.kind === "client" &&
        s.labels.state === "total"
    );
    const hubOnlineClients = samples.find(
      (s) =>
        s.name === "aloha_hub_connections" &&
        s.labels.kind === "client" &&
        s.labels.state === "online"
    );
    const hubTotalServers = samples.find(
      (s) =>
        s.name === "aloha_hub_connections" &&
        s.labels.kind === "server" &&
        s.labels.state === "total"
    );

    expect(hubTotalClients, "hub total client gauge missing").toBeDefined();
    expect(hubOnlineClients, "hub online client gauge missing").toBeDefined();
    expect(hubTotalServers, "hub total server gauge missing").toBeDefined();

    const connectionUpSamples = samples.filter(
      (s) => s.name === "aloha_connection_up" && s.labels.type === "mcp"
    );
    const upCount = connectionUpSamples.filter((s) => s.value === 1).length;

    expect(hubTotalClients!.value).toBeGreaterThanOrEqual(1);
    expect(hubOnlineClients!.value).toBe(upCount);
    expect(hubTotalServers!.value).toBeGreaterThanOrEqual(1);
  });
});
