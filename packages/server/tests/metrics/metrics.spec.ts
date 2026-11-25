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

import { expect } from "chai";
import sinon from "sinon";
import { TaskState } from "@a2a-js/sdk";
import { PrometheusMetricsProvider } from "../../src/metrics/prometheus";
import { NoopMetricsProvider } from "../../src/metrics/noop";

describe("PrometheusMetricsProvider", () => {
  let provider: PrometheusMetricsProvider;

  beforeEach(() => {
    provider = new PrometheusMetricsProvider("aloha_");
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  describe("lifecycle", () => {
    it("should not be initialized by default", () => {
      expect(provider.isInitialized()).to.be.false;
    });

    it("should be initialized after init()", () => {
      provider.init();
      expect(provider.isInitialized()).to.be.true;
    });

    it("should not throw when init() is called twice", () => {
      provider.init();
      expect(() => provider.init()).to.not.throw();
      expect(provider.isInitialized()).to.be.true;
    });

    it("should no longer be initialized after shutdown()", async () => {
      provider.init();
      await provider.shutdown();
      expect(provider.isInitialized()).to.be.false;
    });
  });

  describe("getRouter()", () => {
    it("should return a router (function with stack)", () => {
      const router = provider.getRouter();
      expect(router).to.be.a("function");
    });

    it("should respond 503 when not initialized", (done) => {
      const router = provider.getRouter();
      const req = { method: "GET", url: "/" } as any;
      const res = {
        status: sinon.stub().returnsThis(),
        send: sinon.stub().callsFake(() => {
          expect(res.status.calledWith(503)).to.be.true;
          expect(res.send.calledWith("Metrics not initialized")).to.be.true;
          done();
        }),
      } as any;
      router(req, res, () => {});
    });
  });

  describe("observation methods when not initialized", () => {
    it("should not throw on connectionState", () => {
      expect(() =>
        provider.connectionState("id-1", "test", "mcp", true)
      ).to.not.throw();
    });

    it("should not throw on clearConnectionState", () => {
      expect(() =>
        provider.clearConnectionState("id-1", "test", "mcp")
      ).to.not.throw();
    });

    it("should not throw on connectionTransition", () => {
      expect(() =>
        provider.connectionTransition("id-1", "test", "mcp", "connected")
      ).to.not.throw();
    });

    it("should not throw on serverState", () => {
      expect(() =>
        provider.serverState("srv-1", "/path", true)
      ).to.not.throw();
    });

    it("should not throw on clearServerState", () => {
      expect(() =>
        provider.clearServerState("srv-1", "/path")
      ).to.not.throw();
    });

    it("should not throw on pingComplete", () => {
      expect(() => provider.pingComplete("id-1", "mcp", 0.05)).to.not.throw();
    });

    it("should not throw on hubSummary", () => {
      expect(() => provider.hubSummary("client", 5, 10)).to.not.throw();
    });

    it("should not throw on mcpRequestComplete", () => {
      expect(() =>
        provider.mcpRequestComplete("/path", "tools/call", "user1", 0.5, true)
      ).to.not.throw();
    });

    it("should not throw on mcpToolCallComplete", () => {
      expect(() =>
        provider.mcpToolCallComplete("/path", "search", 1.0)
      ).to.not.throw();
    });

    it("should not throw on mcpSessionDelta", () => {
      expect(() => provider.mcpSessionDelta("/path", 2)).to.not.throw();
    });

    it("should not throw on a2aRequestComplete", () => {
      expect(() =>
        provider.a2aRequestComplete("/agent", "message/send", "u", 0.3, true)
      ).to.not.throw();
    });

    it("should not throw on a2aTaskStatus", () => {
      expect(() =>
        provider.a2aTaskStatus("/agent", TaskState.TASK_STATE_COMPLETED)
      ).to.not.throw();
    });

    it("should not throw on a2aTasksActive", () => {
      expect(() => provider.a2aTasksActive("/agent", 1)).to.not.throw();
    });

    it("should not throw on debugMcpRequest", () => {
      expect(() =>
        provider.debugMcpRequest("id-1", "tools/list", true)
      ).to.not.throw();
    });

    it("should not throw on debugA2aRequest", () => {
      expect(() =>
        provider.debugA2aRequest("agent-1", "message_send", true)
      ).to.not.throw();
    });

    it("should not throw on testbedExecution", () => {
      expect(() =>
        provider.testbedExecution("tb-1", true)
      ).to.not.throw();
    });

    it("should not throw on authFailure", () => {
      expect(() => provider.authFailure("jwt", "expired")).to.not.throw();
    });

    it("should not throw on proxyUpstreamError", () => {
      expect(() =>
        provider.proxyUpstreamError("/path", "mcp", "timeout")
      ).to.not.throw();
    });

    it("should not throw on proxyResponseSize", () => {
      expect(() =>
        provider.proxyResponseSize("/path", "a2a", 4096)
      ).to.not.throw();
    });

    it("should not throw on connectionRequestReceived", () => {
      expect(() =>
        provider.connectionRequestReceived("id-1", "my-server")
      ).to.not.throw();
    });
  });

  describe("observation methods when initialized", () => {
    beforeEach(() => {
      provider.init();
    });

    it("should record connectionState without error", () => {
      expect(() =>
        provider.connectionState("id-1", "my-server", "mcp", true)
      ).to.not.throw();
    });

    it("should record connectionTransition without error", () => {
      expect(() =>
        provider.connectionTransition("id-1", "my-server", "mcp", "connected")
      ).to.not.throw();
    });

    it("should record serverState without error", () => {
      expect(() =>
        provider.serverState("srv-1", "/my-path", true)
      ).to.not.throw();
    });

    it("should record pingComplete without error", () => {
      expect(() => provider.pingComplete("id-1", "mcp", 0.042)).to.not.throw();
    });

    it("should record hubSummary without error", () => {
      expect(() => provider.hubSummary("client", 5, 10)).to.not.throw();
    });

    it("should record mcpRequestComplete without error", () => {
      expect(() =>
        provider.mcpRequestComplete("/path", "tools/list", "user1", 0.15, true)
      ).to.not.throw();
    });

    it("should record mcpToolCallComplete without error", () => {
      expect(() =>
        provider.mcpToolCallComplete("/path", "search_docs", 2.3)
      ).to.not.throw();
    });

    it("should record mcpSessionDelta without error", () => {
      expect(() => provider.mcpSessionDelta("/path", 3)).to.not.throw();
    });

    it("should record a2aRequestComplete without error", () => {
      expect(() =>
        provider.a2aRequestComplete(
          "/agent",
          "message/send",
          "user1",
          1.2,
          true
        )
      ).to.not.throw();
    });

    it("should record a2aTaskStatus without error", () => {
      expect(() =>
        provider.a2aTaskStatus("/agent", TaskState.TASK_STATE_COMPLETED)
      ).to.not.throw();
    });

    it("should record a2aTasksActive without error", () => {
      expect(() => provider.a2aTasksActive("/agent", 2)).to.not.throw();
    });

    it("should record authFailure without error", () => {
      expect(() => provider.authFailure("oidc", "invalid")).to.not.throw();
    });

    it("should record proxyUpstreamError without error", () => {
      expect(() =>
        provider.proxyUpstreamError("/path", "mcp", "timeout")
      ).to.not.throw();
    });

    it("should record proxyResponseSize without error", () => {
      expect(() =>
        provider.proxyResponseSize("/path", "a2a", 4096)
      ).to.not.throw();
    });

    it("should record connectionRequestReceived without error", () => {
      expect(() =>
        provider.connectionRequestReceived("id-1", "my-server")
      ).to.not.throw();
    });
  });

  describe("series removal (clear*)", () => {
    beforeEach(() => {
      provider.init();
    });

    it("should remove connection_up series via clearConnectionState", () => {
      provider.connectionState("id-1", "coolmcp", "mcp", true);
      // Should not throw and should not crash the next scrape.
      expect(() =>
        provider.clearConnectionState("id-1", "coolmcp", "mcp")
      ).to.not.throw();
    });

    it("should remove server_up series via clearServerState", () => {
      provider.serverState("srv-1", "/my-path", true);
      expect(() =>
        provider.clearServerState("srv-1", "/my-path")
      ).to.not.throw();
    });

    it("clearConnectionState should also clear connection_last_request_timestamp", () => {
      provider.connectionRequestReceived("id-1", "coolmcp");
      expect(() =>
        provider.clearConnectionState("id-1", "coolmcp", "mcp")
      ).to.not.throw();
    });
  });

  describe("scrape output", () => {
    it("should contain Node.js process metrics when initialized", (done) => {
      provider.init();
      const router = provider.getRouter();
      const req = { method: "GET", url: "/" } as any;
      const res = {
        set: sinon.stub().returnsThis(),
        end: sinon.stub().callsFake((body: string) => {
          expect(body).to.include("process_cpu_");
          expect(body).to.include("nodejs_");
          done();
        }),
        status: sinon.stub().returnsThis(),
      } as any;
      router(req, res, () => {});
    });

    it("should contain domain metrics after observation", (done) => {
      provider.init();
      provider.connectionState("id-1", "my-mcp", "mcp", true);
      provider.connectionTransition("id-1", "my-mcp", "mcp", "connected");
      provider.pingComplete("id-1", "mcp", 0.05);
      provider.hubSummary("client", 1, 1);

      const router = provider.getRouter();
      const req = { method: "GET", url: "/" } as any;
      const res = {
        set: sinon.stub().returnsThis(),
        end: sinon.stub().callsFake((body: string) => {
          expect(body).to.include("aloha_connection_up");
          expect(body).to.include("aloha_connection_transitions_total");
          expect(body).to.include("aloha_ping_duration_seconds");
          expect(body).to.include("aloha_hub_connections");
          done();
        }),
        status: sinon.stub().returnsThis(),
      } as any;
      router(req, res, () => {});
    });

    it("renders a2a_task_status_total with the string state label, not the numeric enum", (done) => {
      provider.init();
      provider.a2aTaskStatus("my-agent", TaskState.TASK_STATE_SUBMITTED);
      provider.a2aTaskStatus("my-agent", TaskState.TASK_STATE_COMPLETED);
      provider.a2aTaskStatus("my-agent", TaskState.TASK_STATE_CANCELED);

      const router = provider.getRouter();
      const req = { method: "GET", url: "/" } as any;
      const res = {
        set: sinon.stub().returnsThis(),
        end: sinon.stub().callsFake((body: string) => {
          expect(body).to.include('task_status="submitted"');
          expect(body).to.include('task_status="completed"');
          expect(body).to.include('task_status="canceled"');
          // The numeric enum value must never leak into the label.
          expect(body).to.not.include('task_status="1"');
          expect(body).to.not.include('task_status="3"');
          expect(body).to.not.include('task_status="5"');
          done();
        }),
        status: sinon.stub().returnsThis(),
      } as any;
      router(req, res, () => {});
    });

    it("should NOT contain a removed series after clearConnectionState", (done) => {
      provider.init();
      provider.connectionState("id-1", "coolmcp", "mcp", true);
      provider.clearConnectionState("id-1", "coolmcp", "mcp");

      const router = provider.getRouter();
      const req = { method: "GET", url: "/" } as any;
      const res = {
        set: sinon.stub().returnsThis(),
        end: sinon.stub().callsFake((body: string) => {
          // The series for connection_id="id-1" should be absent.
          expect(body).to.not.include('connection_id="id-1"');
          done();
        }),
        status: sinon.stub().returnsThis(),
      } as any;
      router(req, res, () => {});
    });
  });
});

describe("NoopMetricsProvider", () => {
  it("should not throw on any method call", () => {
    const noop = new NoopMetricsProvider();
    expect(() => noop.init()).to.not.throw();
    expect(() => noop.connectionState("a", "b", "mcp", true)).to.not.throw();
    expect(() => noop.clearConnectionState("a", "b", "mcp")).to.not.throw();
    expect(() => noop.connectionTransition("a", "b", "mcp", "connected")).to.not.throw();
    expect(() => noop.serverState("a", "b", true)).to.not.throw();
    expect(() => noop.clearServerState("a", "b")).to.not.throw();
    expect(() => noop.pingComplete("a", "mcp", 0.1)).to.not.throw();
    expect(() => noop.hubSummary("client", 1, 1)).to.not.throw();
    expect(() => noop.mcpRequestComplete("a", "b", "c", 0.1, true)).to.not.throw();
    expect(() => noop.mcpToolCallComplete("a", "b", 0.1)).to.not.throw();
    expect(() => noop.mcpSessionDelta("a", 1)).to.not.throw();
    expect(() => noop.a2aRequestComplete("a", "b", "c", 0.1, true)).to.not.throw();
    expect(() => noop.a2aTaskStatus("a", TaskState.TASK_STATE_COMPLETED)).to.not.throw();
    expect(() => noop.a2aTasksActive("a", 1)).to.not.throw();
    expect(() => noop.debugMcpRequest("a", "b", true)).to.not.throw();
    expect(() => noop.debugA2aRequest("a", "b", true)).to.not.throw();
    expect(() => noop.testbedExecution("a", true)).to.not.throw();
    expect(() => noop.authFailure("jwt", "expired")).to.not.throw();
    expect(() => noop.proxyUpstreamError("a", "mcp", "timeout")).to.not.throw();
    expect(() => noop.proxyResponseSize("a", "mcp", 100)).to.not.throw();
    expect(() => noop.connectionRequestReceived("a", "b")).to.not.throw();
  });

  it("getRouter should return 404 with disabled message", (done) => {
    const noop = new NoopMetricsProvider();
    const router = noop.getRouter();
    const req = { method: "GET", url: "/" } as any;
    const res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().callsFake(() => {
        expect(res.status.calledWith(404)).to.be.true;
        expect(res.send.firstCall.args[0]).to.include("disabled");
        done();
      }),
    } as any;
    router(req, res, () => {});
  });
});
