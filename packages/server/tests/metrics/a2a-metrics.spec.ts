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
import { schemas } from "aloha-shared";
// Import injector BEFORE A2AClient so typed-inject resolves metricsProvider
// consistently (mirrors the ordering used in mcp-manager.spec.ts).
import "../../src/injector/injector";
import { injector } from "../../src/injector/injector";
import { A2AClient } from "../../src/connections/a2a-client";
import { PrometheusMetricsProvider } from "../../src/metrics/prometheus";
import { requestContext } from "../../src/middleware/request-context";
import { TaskState } from "@a2a-js/sdk";
import type { Task } from "@a2a-js/sdk";
import type { AgentExecutionEvent } from "@a2a-js/sdk/server";

const makeAgentOpts = (
  overrides: Partial<schemas.AgentWithId> = {}
): schemas.AgentWithId => ({
  id: "agent-1",
  name: "Test Agent",
  serverUrl: "http://localhost:4000",
  serverProtocol: "a2a",
  serverPath: "test-agent",
  type: "agent",
  creator: "test",
  visibility: schemas.Visibility.Public,
  ...overrides,
});

const makeTask = (state: Task["status"]["state"], id = "task-1"): Task => ({
  kind: "task",
  id,
  contextId: "ctx-1",
  status: { state },
  history: [],
});

// The v2 streaming client yields StreamResponse envelopes (payload.$case),
// which A2AClient.sendMessage unwraps via streamResponseToAgentEvent. Wrap a
// Task so the fake stream mirrors what the real transport delivers.
const makeTaskStreamResponse = (task: Task) => ({
  payload: { $case: "task" as const, value: task },
});

describe("A2AClient metrics instrumentation", () => {
  let metrics: sinon.SinonSpiedInstance<PrometheusMetricsProvider>;
  let client: A2AClient;

  beforeEach(() => {
    // Resolve the real Prometheus-backed provider from the injector (the
    // same instance A2AClient resolves internally) and initialize it so
    // observations actually reach the underlying prom-client instruments —
    // then spy on it so we can assert on call args, mirroring how
    // MCPManager tests inject a concrete MetricsProvider.
    const provider = injector().resolve(
      "metricsProvider"
    ) as PrometheusMetricsProvider;
    provider.init();
    metrics = sinon.spy(provider);
    client = new A2AClient(makeAgentOpts(), undefined);
  });

  afterEach(async () => {
    sinon.restore();
    const provider = injector().resolve(
      "metricsProvider"
    ) as PrometheusMetricsProvider;
    await provider.shutdown();
  });

  describe("sendMessage", () => {
    it("records a2aRequestComplete with operation message/send for non-streaming agents", async () => {
      (client as any).agentCard = { capabilities: { streaming: false } };
      const fakeA2AClient = {
        sendMessage: sinon.stub().resolves(makeTask(TaskState.TASK_STATE_COMPLETED)),
      };
      sinon.stub(client as any, "connectToA2AServer").resolves(fakeA2AClient);

      const events: AgentExecutionEvent[] = [];
      await client.sendMessage(
        { message: { kind: "message", messageId: "m1", role: "user", parts: [] } } as any,
        undefined,
        async (e) => {
          events.push(e);
        }
      );

      expect(metrics.a2aRequestComplete.calledOnce).to.be.true;
      const [agentPath, operation, , , success] =
        metrics.a2aRequestComplete.firstCall.args;
      expect(agentPath).to.equal("test-agent");
      expect(operation).to.equal("message/send");
      expect(success).to.be.true;
      expect(events).to.have.lengthOf(1);
    });

    it("records operation message/stream for streaming agents", async () => {
      (client as any).agentCard = { capabilities: { streaming: true } };
      async function* fakeStream() {
        yield makeTaskStreamResponse(makeTask(TaskState.TASK_STATE_SUBMITTED));
      }
      const fakeA2AClient = {
        sendMessageStream: sinon.stub().returns(fakeStream()),
      };
      sinon.stub(client as any, "connectToA2AServer").resolves(fakeA2AClient);

      await client.sendMessage(
        { message: { kind: "message", messageId: "m1", role: "user", parts: [] } } as any,
        undefined,
        async () => {}
      );

      expect(metrics.a2aRequestComplete.calledOnce).to.be.true;
      const [, operation] = metrics.a2aRequestComplete.firstCall.args;
      expect(operation).to.equal("message/stream");
    });

    it("records a2aRequestComplete with success=false when the upstream call throws", async () => {
      (client as any).agentCard = { capabilities: { streaming: false } };
      const fakeA2AClient = {
        sendMessage: sinon.stub().rejects(new Error("upstream error")),
      };
      sinon.stub(client as any, "connectToA2AServer").resolves(fakeA2AClient);

      let thrown = false;
      try {
        await client.sendMessage(
          { message: { kind: "message", messageId: "m1", role: "user", parts: [] } } as any,
          undefined,
          async () => {}
        );
      } catch {
        thrown = true;
      }

      expect(thrown).to.be.true;
      expect(metrics.a2aRequestComplete.calledOnce).to.be.true;
      const [, , , , success] = metrics.a2aRequestComplete.firstCall.args;
      expect(success).to.be.false;
    });

    it("records task submitted/completed transitions and active task gauge via updateTaskMap", async () => {
      (client as any).agentCard = { capabilities: { streaming: true } };
      async function* fakeStream() {
        yield makeTaskStreamResponse(makeTask(TaskState.TASK_STATE_SUBMITTED));
        yield makeTaskStreamResponse(makeTask(TaskState.TASK_STATE_COMPLETED));
      }
      const fakeA2AClient = {
        sendMessageStream: sinon.stub().returns(fakeStream()),
      };
      sinon.stub(client as any, "connectToA2AServer").resolves(fakeA2AClient);

      await client.sendMessage(
        { message: { kind: "message", messageId: "m1", role: "user", parts: [] } } as any,
        undefined,
        async () => {}
      );

      expect(
        metrics.a2aTaskStatus.calledWith(
          "test-agent",
          TaskState.TASK_STATE_SUBMITTED
        )
      ).to.be.true;
      expect(
        metrics.a2aTaskStatus.calledWith(
          "test-agent",
          TaskState.TASK_STATE_COMPLETED
        )
      ).to.be.true;
      // taskMap: +1 on submitted (size 1), -1 on completed (size 0)
      expect(metrics.a2aTasksActive.calledWith("test-agent", 1)).to.be.true;
      expect(metrics.a2aTasksActive.calledWith("test-agent", 0)).to.be.true;
    });
  });

  describe("cancelTask", () => {
    it("records a2aRequestComplete with operation task/cancel on success", async () => {
      const submitted = makeTask(TaskState.TASK_STATE_SUBMITTED, "task-1");
      (client as any).taskMap.set("task-1", {
        task: submitted,
        tokenSetProvider: undefined,
        createdAt: Date.now(),
      });
      const fakeA2AClient = {
        cancelTask: sinon.stub().resolves(makeTask(TaskState.TASK_STATE_CANCELED, "task-1")),
      };
      sinon.stub(client as any, "connectToA2AServer").resolves(fakeA2AClient);

      const publish = sinon.stub();
      await client.cancelTask("task-1", { publish });

      expect(metrics.a2aRequestComplete.calledOnce).to.be.true;
      const [agentPath, operation, , , success] =
        metrics.a2aRequestComplete.firstCall.args;
      expect(agentPath).to.equal("test-agent");
      expect(operation).to.equal("task/cancel");
      expect(success).to.be.true;
      expect(
        metrics.a2aTaskStatus.calledWith(
          "test-agent",
          TaskState.TASK_STATE_CANCELED
        )
      ).to.be.true;
      expect(publish.calledOnce).to.be.true;
    });

    it("records a2aRequestComplete with success=false when cancellation fails", async () => {
      const submitted = makeTask(TaskState.TASK_STATE_SUBMITTED, "task-1");
      (client as any).taskMap.set("task-1", {
        task: submitted,
        tokenSetProvider: undefined,
        createdAt: Date.now(),
      });
      const fakeA2AClient = {
        cancelTask: sinon.stub().rejects(new Error("cancel failed")),
      };
      sinon.stub(client as any, "connectToA2AServer").resolves(fakeA2AClient);

      const publish = sinon.stub();
      await client.cancelTask("task-1", { publish });

      expect(metrics.a2aRequestComplete.calledOnce).to.be.true;
      const [, , , , success] = metrics.a2aRequestComplete.firstCall.args;
      expect(success).to.be.false;
      expect(publish.calledOnce).to.be.true;
    });
  });

  describe("user label resolution", () => {
    it("falls back to anonymous when no request is in flight", async () => {
      (client as any).agentCard = { capabilities: { streaming: false } };
      const fakeA2AClient = {
        sendMessage: sinon.stub().resolves(makeTask(TaskState.TASK_STATE_COMPLETED)),
      };
      sinon.stub(client as any, "connectToA2AServer").resolves(fakeA2AClient);

      // Ensure we are NOT inside requestContext.run(...) for this assertion.
      expect(requestContext.getStore()).to.be.undefined;

      await client.sendMessage(
        { message: { kind: "message", messageId: "m1", role: "user", parts: [] } } as any,
        undefined,
        async () => {}
      );

      const [, , user] = metrics.a2aRequestComplete.firstCall.args;
      expect(user).to.equal("anonymous");
    });
  });
});
