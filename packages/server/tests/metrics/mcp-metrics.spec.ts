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
// [Note: File generated using Generative AI technology]

import { expect } from "chai";
import sinon from "sinon";
// Import injector BEFORE mcp-server so typed-inject resolves metricsProvider
// consistently (mirrors the ordering used in mcp-manager.spec.ts).
import "../../src/injector/injector";
import { injector } from "../../src/injector/injector";
import {
  withMcpRequestMetrics,
  classifyUpstreamError,
} from "../../src/connections/mcp-server";
import { PrometheusMetricsProvider } from "../../src/metrics/prometheus";
import { requestContext } from "../../src/middleware/request-context";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type * as mcpTypes from "@modelcontextprotocol/sdk/types.js";

const makeContext = (): RequestHandlerExtra<
  mcpTypes.Request,
  mcpTypes.Notification
> =>
  ({
    signal: new AbortController().signal,
    requestId: "req-1",
    sessionId: "session-1",
    sendNotification: sinon.stub().resolves(),
    sendRequest: sinon.stub().resolves(),
  }) as unknown as RequestHandlerExtra<mcpTypes.Request, mcpTypes.Notification>;

describe("withMcpRequestMetrics", () => {
  let provider: PrometheusMetricsProvider;
  let metrics: sinon.SinonSpiedInstance<PrometheusMetricsProvider>;

  beforeEach(() => {
    provider = injector().resolve(
      "metricsProvider"
    ) as PrometheusMetricsProvider;
    provider.init();
    metrics = sinon.spy(provider);
  });

  afterEach(async () => {
    sinon.restore();
    await provider.shutdown();
  });

  it("records mcpRequestComplete with the given serverPath/operation on success", async () => {
    const handler = sinon.stub().resolves({ tools: [] });
    const wrapped = withMcpRequestMetrics("my-server", "tools/list", handler);

    const result = await wrapped(
      { method: "tools/list" } as mcpTypes.Request,
      makeContext()
    );

    expect(result).to.deep.equal({ tools: [] });
    expect(metrics.mcpRequestComplete.calledOnce).to.be.true;
    const [serverPath, operation, user, durationSec, success] =
      metrics.mcpRequestComplete.firstCall.args;
    expect(serverPath).to.equal("my-server");
    expect(operation).to.equal("tools/list");
    expect(user).to.equal("anonymous");
    expect(durationSec).to.be.a("number");
    expect(success).to.be.true;
  });

  it("records mcpRequestComplete with success=false and rethrows when the handler throws", async () => {
    const handler = sinon.stub().rejects(new Error("boom"));
    const wrapped = withMcpRequestMetrics("my-server", "resources/list", handler);

    let thrown: unknown;
    try {
      await wrapped({ method: "resources/list" } as mcpTypes.Request, makeContext());
    } catch (e) {
      thrown = e;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect(metrics.mcpRequestComplete.calledOnce).to.be.true;
    const [, , , , success] = metrics.mcpRequestComplete.firstCall.args;
    expect(success).to.be.false;
    expect(metrics.mcpToolCallComplete.called).to.be.false;
  });

  it("also records mcpToolCallComplete for tools/call requests, using the tool name from params", async () => {
    const handler = sinon.stub().resolves({ content: [] });
    const wrapped = withMcpRequestMetrics("my-server", "tools/call", handler);

    await wrapped(
      {
        method: "tools/call",
        params: { name: "my-server.some_tool", arguments: {} },
      } as unknown as mcpTypes.Request,
      makeContext()
    );

    expect(metrics.mcpToolCallComplete.calledOnce).to.be.true;
    const [serverPath, toolName, durationSec] =
      metrics.mcpToolCallComplete.firstCall.args;
    expect(serverPath).to.equal("my-server");
    expect(toolName).to.equal("my-server.some_tool");
    expect(durationSec).to.be.a("number");
  });

  it("does not record mcpToolCallComplete for non tools/call operations", async () => {
    const handler = sinon.stub().resolves({ prompts: [] });
    const wrapped = withMcpRequestMetrics("my-server", "prompts/list", handler);

    await wrapped({ method: "prompts/list" } as mcpTypes.Request, makeContext());

    expect(metrics.mcpToolCallComplete.called).to.be.false;
  });

  it("resolves the user label from the ambient request context when authenticated", async () => {
    const handler = sinon.stub().resolves({ tools: [] });
    const wrapped = withMcpRequestMetrics("my-server", "tools/list", handler);

    const fakeReq = {
      session: { user: { userId: "user-42", displayName: "Test User" } },
    } as any;

    await requestContext.run(fakeReq, async () => {
      await wrapped({ method: "tools/list" } as mcpTypes.Request, makeContext());
    });

    const [, , user] = metrics.mcpRequestComplete.firstCall.args;
    expect(user).to.equal("user-42");
  });

  it("records proxyResponseSize on successful request", async () => {
    const handler = sinon.stub().resolves({ tools: [{ name: "a" }] });
    const wrapped = withMcpRequestMetrics("my-server", "tools/list", handler);

    await wrapped({ method: "tools/list" } as mcpTypes.Request, makeContext());

    expect(metrics.proxyResponseSize.calledOnce).to.be.true;
    const [serverPath, type, sizeBytes] =
      metrics.proxyResponseSize.firstCall.args;
    expect(serverPath).to.equal("my-server");
    expect(type).to.equal("mcp");
    expect(sizeBytes).to.be.a("number").and.to.be.greaterThan(0);
  });

  it("records proxyUpstreamError on handler failure", async () => {
    const handler = sinon.stub().rejects(new Error("ECONNREFUSED"));
    const wrapped = withMcpRequestMetrics("my-server", "tools/list", handler);

    try {
      await wrapped({ method: "tools/list" } as mcpTypes.Request, makeContext());
    } catch {
      // expected
    }

    expect(metrics.proxyUpstreamError.calledOnce).to.be.true;
    const [serverPath, type, errorKind] =
      metrics.proxyUpstreamError.firstCall.args;
    expect(serverPath).to.equal("my-server");
    expect(type).to.equal("mcp");
    expect(errorKind).to.equal("connection_refused");
  });

  it("records connectionRequestReceived when connectionIdentity is provided", async () => {
    const handler = sinon.stub().resolves({ tools: [] });
    const wrapped = withMcpRequestMetrics(
      "my-server",
      "tools/list",
      handler,
      { id: "srv-1", name: "My Server" }
    );

    await wrapped({ method: "tools/list" } as mcpTypes.Request, makeContext());

    expect(metrics.connectionRequestReceived.calledOnce).to.be.true;
    const [connId, name] = metrics.connectionRequestReceived.firstCall.args;
    expect(connId).to.equal("srv-1");
    expect(name).to.equal("My Server");
  });

  it("does not record connectionRequestReceived when connectionIdentity is not provided", async () => {
    const handler = sinon.stub().resolves({ tools: [] });
    const wrapped = withMcpRequestMetrics("my-server", "tools/list", handler);

    await wrapped({ method: "tools/list" } as mcpTypes.Request, makeContext());

    expect(metrics.connectionRequestReceived.called).to.be.false;
  });
});

describe("classifyUpstreamError", () => {
  it("classifies timeout errors", () => {
    expect(classifyUpstreamError(new Error("Request timed out"))).to.equal("timeout");
    expect(classifyUpstreamError(new Error("ETIMEDOUT"))).to.equal("timeout");
    expect(classifyUpstreamError(new Error("socket timeout"))).to.equal("timeout");
  });

  it("classifies connection refused errors", () => {
    expect(classifyUpstreamError(new Error("ECONNREFUSED"))).to.equal("connection_refused");
    expect(classifyUpstreamError(new Error("Connection refused"))).to.equal("connection_refused");
    expect(classifyUpstreamError(new Error("ENOTFOUND"))).to.equal("connection_refused");
    expect(classifyUpstreamError(new Error("ECONNRESET"))).to.equal("connection_refused");
  });

  it("classifies auth failures", () => {
    expect(classifyUpstreamError(new Error("401 Unauthorized"))).to.equal("auth_failure");
    expect(classifyUpstreamError(new Error("403 Forbidden"))).to.equal("auth_failure");
    expect(classifyUpstreamError(new Error("auth token invalid"))).to.equal("auth_failure");
  });

  it("defaults to upstream_error for unknown errors", () => {
    expect(classifyUpstreamError(new Error("something weird happened"))).to.equal("upstream_error");
    expect(classifyUpstreamError("a string error")).to.equal("upstream_error");
    expect(classifyUpstreamError(null)).to.equal("upstream_error");
  });
});
