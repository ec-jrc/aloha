import {
  A2A_PROTOCOL_VERSION,
  AGENT_CARD_PATH,
  AgentCard,
  Message,
  Role,
  Task,
  TaskState,
} from "@a2a-js/sdk";
import {
  AgentEvent,
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

const supportedInterfaces = [
  {
    url: "http://localhost:4000/a2a/jsonrpc",
    protocolBinding: "JSONRPC",
    tenant: "",
    protocolVersion: A2A_PROTOCOL_VERSION,
  },
  {
    url: "http://localhost:4000/a2a/rest",
    protocolBinding: "HTTP+JSON",
    tenant: "",
    protocolVersion: A2A_PROTOCOL_VERSION,
  },
];

const streamingAgentCard: AgentCard = {
  name: "Hello Agent",
  description: "A simple agent that says hello.",
  version: "0.1.0",
  supportedInterfaces,
  provider: undefined,
  skills: [
    {
      id: "chat",
      name: "Chat",
      description: "Say hello",
      tags: ["chat"],
      examples: [],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
  ],
  capabilities: {
    pushNotifications: false,
    streaming: true,
    extensions: [],
  },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  signatures: [],
};

const helloAgentCard: AgentCard = {
  name: "Hello Agent",
  description: "A simple agent that says hello.",
  version: "0.1.0",
  supportedInterfaces,
  provider: undefined,
  skills: [
    {
      id: "chat",
      name: "Chat",
      description: "Say hello",
      tags: ["chat"],
      examples: [],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
  ],
  capabilities: {
    pushNotifications: false,
    extensions: [],
  },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  signatures: [],
};

function textMessage(text: string, contextId = ""): Message {
  return {
    messageId: uuidv4(),
    contextId,
    taskId: "",
    role: Role.ROLE_AGENT,
    parts: [
      {
        content: { $case: "text", value: text },
        metadata: undefined,
        filename: "",
        mediaType: "text/plain",
      },
    ],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

// 2. Implement the agent's logic.
class HelloExecutor implements AgentExecutor {
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    // Create a direct message response.
    const responseMessage = textMessage(
      "Hello, world!",
      requestContext.contextId
    );

    // Publish the message and signal that the interaction is finished.
    eventBus.publish(AgentEvent.message(responseMessage));
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
        id: taskId,
        contextId: contextId,
        status: {
          state: TaskState.TASK_STATE_SUBMITTED,
          message: textMessage("Long running task just submitted", contextId),
          timestamp: new Date().toISOString(),
        },
        artifacts: [],
        history: [userMessage],
        metadata: undefined,
      };
      eventBus.publish(AgentEvent.task(initialTask));
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (this.canceledTasks.includes(taskId)) {
      return eventBus.publish(
        AgentEvent.statusUpdate({
          taskId: taskId,
          contextId: contextId,
          status: {
            state: TaskState.TASK_STATE_CANCELED,
            message: undefined,
            timestamp: new Date().toISOString(),
          },
          metadata: undefined,
        })
      );
    }
    // 2. Publish 'working' state.
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_WORKING,
          timestamp: new Date().toISOString(),
          message: textMessage("Long running task is working", contextId),
        },
        metadata: undefined,
      })
    );

    // 3. Simulate work and publish an artifact.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (this.canceledTasks.includes(taskId)) {
      return eventBus.publish(
        AgentEvent.statusUpdate({
          taskId: taskId,
          contextId: contextId,
          status: {
            state: TaskState.TASK_STATE_CANCELED,
            message: undefined,
            timestamp: new Date().toISOString(),
          },
          metadata: undefined,
        })
      );
    }
    eventBus.publish(
      AgentEvent.artifactUpdate({
        taskId,
        contextId,
        artifact: {
          artifactId: "result.txt",
          name: "result.txt",
          description: "",
          parts: [
            {
              content: { $case: "text", value: "First result." },
              metadata: undefined,
              filename: "",
              mediaType: "text/plain",
            },
          ],
          metadata: undefined,
          extensions: [],
        },
        append: false,
        lastChunk: true,
        metadata: undefined,
      })
    );

    // 4. Publish final 'completed' state.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (this.canceledTasks.includes(taskId)) {
      return eventBus.publish(
        AgentEvent.statusUpdate({
          taskId: taskId,
          contextId: contextId,
          status: {
            state: TaskState.TASK_STATE_CANCELED,
            message: undefined,
            timestamp: new Date().toISOString(),
          },
          metadata: undefined,
        })
      );
    }
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_COMPLETED,
          timestamp: new Date().toISOString(),
          message: textMessage(
            "Long running task is completed, please check the artifact",
            contextId
          ),
        },
        metadata: undefined,
      })
    );
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
