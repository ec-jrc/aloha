import { AGENT_CARD_PATH, AgentCard, Message, Task } from "@a2a-js/sdk";
import {
  AgentExecutor,
  DefaultRequestHandler,
  ExecutionEventBus,
  InMemoryTaskStore,
  RequestContext,
} from "@a2a-js/sdk/server";
import {
  agentCardHandler,
  jsonRpcHandler,
  restHandler,
  UserBuilder,
} from "@a2a-js/sdk/server/express";
import express from "express";
import { v4 as uuidv4 } from "uuid";

const streamingAgentCard: AgentCard = {
  name: "Hello Agent",
  description: "A simple agent that says hello.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:4000/a2a/jsonrpc", // The public URL of your agent server
  skills: [
    { id: "chat", name: "Chat", description: "Say hello", tags: ["chat"] },
  ],
  capabilities: {
    pushNotifications: false,
    streaming: true,
  },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  additionalInterfaces: [
    { url: "http://localhost:4000/a2a/jsonrpc", transport: "JSONRPC" }, // Default JSON-RPC transport
    { url: "http://localhost:4000/a2a/rest", transport: "HTTP+JSON" }, // HTTP+JSON/REST transport
  ],
};

const helloAgentCard: AgentCard = {
  name: "Hello Agent",
  description: "A simple agent that says hello.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:4000/a2a/jsonrpc", // The public URL of your agent server
  skills: [
    { id: "chat", name: "Chat", description: "Say hello", tags: ["chat"] },
  ],
  capabilities: {
    pushNotifications: false,
  },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  additionalInterfaces: [
    { url: "http://localhost:4000/a2a/jsonrpc", transport: "JSONRPC" }, // Default JSON-RPC transport
    { url: "http://localhost:4000/a2a/rest", transport: "HTTP+JSON" }, // HTTP+JSON/REST transport
  ],
};

// 2. Implement the agent's logic.
class HelloExecutor implements AgentExecutor {
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    // Create a direct message response.
    const responseMessage: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [{ kind: "text", text: "Hello, world!" }],
      // Associate the response with the incoming request's context.
      contextId: requestContext.contextId,
    };

    // Publish the message and signal that the interaction is finished.
    eventBus.publish(responseMessage);
    eventBus.finished();
  }

  // cancelTask is not needed for this simple, non-stateful agent.
  cancelTask = async (): Promise<void> => {};
}

class StreamingExecutor implements AgentExecutor {
  private canceledTasks: string[] = [];
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext;

    // 1. Create and publish the initial task object if it doesn't exist.
    if (!task) {
      const initialTask: Task = {
        kind: "task",
        id: taskId,
        contextId: contextId,
        status: {
          state: "submitted",
          message: {
            messageId: uuidv4(),
            role: "agent",
            kind: "message",
            parts: [
              {
                kind: "text",
                text: "Long running task just submitted",
              },
            ],
          },
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
      };
      eventBus.publish(initialTask);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (this.canceledTasks.includes(taskId)) {
      return eventBus.publish({
        kind: "status-update",
        taskId: taskId,
        contextId: contextId,
        status: { state: "canceled", timestamp: new Date().toISOString() },
        final: true,
      });
    }
    // 2. Publish 'working' state.
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state: "working",
        timestamp: new Date().toISOString(),

        message: {
          messageId: uuidv4(),
          role: "agent",
          kind: "message",
          parts: [
            {
              kind: "text",
              text: "Long running task is working",
            },
          ],
        },
      },
      final: false,
    });

    // 3. Simulate work and publish an artifact.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (this.canceledTasks.includes(taskId)) {
      return eventBus.publish({
        kind: "status-update",
        taskId: taskId,
        contextId: contextId,
        status: { state: "canceled", timestamp: new Date().toISOString() },
        final: true,
      });
    }
    eventBus.publish({
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: {
        artifactId: "result.txt",
        parts: [{ kind: "text", text: "First result." }],
      },
    });

    // 4. Publish final 'completed' state.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (this.canceledTasks.includes(taskId)) {
      return eventBus.publish({
        kind: "status-update",
        taskId: taskId,
        contextId: contextId,
        status: { state: "canceled", timestamp: new Date().toISOString() },
        final: true,
      });
    }
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state: "completed",
        timestamp: new Date().toISOString(),

        message: {
          messageId: uuidv4(),
          role: "agent",
          kind: "message",
          parts: [
            {
              kind: "text",
              text: "Long running task is completed, please check the artifact",
            },
          ],
        },
      },
      final: true,
    });
    eventBus.finished();
  }
  cancelTask = async (taskId: string): Promise<void> => {
    this.canceledTasks.push(taskId);
  };
}

const isStreaming = process.env.STREAMING === "true";

const agentExecutor = isStreaming
  ? new StreamingExecutor()
  : new HelloExecutor();
const requestHandler = new DefaultRequestHandler(
  isStreaming ? streamingAgentCard : helloAgentCard,
  new InMemoryTaskStore(),
  agentExecutor
);

const app = express();

const requestLogger = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.log(req.headers, req.originalUrl);
  next();
};

app.use(
  `/${AGENT_CARD_PATH}`,
  requestLogger,
  agentCardHandler({ agentCardProvider: requestHandler })
);
app.use(
  "/a2a/jsonrpc",
  requestLogger,
  jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication })
);
app.use(
  "/a2a/rest",
  requestLogger,
  restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication })
);

const portStr = process.env.PORT || "4000";

app.listen(parseInt(portStr, 10) || 4000, () => {
  console.info(`🚀 Server started on http://localhost:${portStr}`);
});
