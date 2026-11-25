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

import {
  AgentCard,
  SendMessageRequest,
  StreamResponse,
  Task,
  TaskState,
} from "@a2a-js/sdk";
import {
  BeforeArgs,
  CallInterceptor,
  Client,
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  RestTransportFactory,
} from "@a2a-js/sdk/client";
import {
  AgentEvent,
  AgentExecutionEvent,
  ExecutionEventBus,
  RequestContext,
} from "@a2a-js/sdk/server";
import { schemas } from "aloha-shared";
import { getLogger } from "../injector/provide-logger";
import { TokenSetProvider } from "../middleware/oidc/oidc-support";
import { assertDefined, unknownToString } from "../utils/type-utils";
import { getAdditionalAuthenticationHeaders } from "./auth-utils";
import { RemoteClient } from "./remote-client";

const logger = getLogger("A2A-CLIENT");

function buildLegacyCompatOptions(): Partial<ClientFactoryOptions> {
  return {
    transports: [
      new JsonRpcTransportFactory({ legacyCompat: { enabled: true } }),
      new RestTransportFactory({ legacyCompat: { enabled: true } }),
    ],
    cardResolver: new DefaultAgentCardResolver({
      legacyCompat: { enabled: true },
    }),
  };
}

class AuthInterceptor implements CallInterceptor {
  constructor(
    public connectionOptions: schemas.AgentWithId,
    private tokenSetProvider: TokenSetProvider | undefined
  ) {}

  async before(args: BeforeArgs): Promise<void> {
    if (this.connectionOptions.authentication) {
      const { additionalHeaders, authProvider } =
        getAdditionalAuthenticationHeaders(
          this.connectionOptions.authentication,
          this.tokenSetProvider
        );

      if (additionalHeaders) {
        args.options = {
          ...args.options,
          serviceParameters: {
            ...args.options?.serviceParameters,
            ...additionalHeaders,
          },
        };
      }
      if (authProvider) {
        const tokens = await Promise.resolve(authProvider.tokens());
        if (tokens) {
          args.options = {
            ...args.options,
            serviceParameters: {
              ...args.options?.serviceParameters,
              Authentication: `Bearer ${tokens.access_token}`,
            },
          };
        }
      }
    }
  }

  after(): Promise<void> {
    return Promise.resolve();
  }
}

const TASK_TTL_MS = parseInt(
  process.env.A2A_TASK_TTL_MS || String(30 * 60 * 1000),
  10
);

const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set([
  TaskState.TASK_STATE_COMPLETED,
  TaskState.TASK_STATE_CANCELED,
  TaskState.TASK_STATE_FAILED,
  TaskState.TASK_STATE_REJECTED,
]);

function streamResponseToAgentEvent(
  response: StreamResponse
): AgentExecutionEvent | undefined {
  const payload = response.payload;
  if (!payload) {
    return undefined;
  }
  switch (payload.$case) {
    case "task":
      return AgentEvent.task(payload.value);
    case "message":
      return AgentEvent.message(payload.value);
    case "statusUpdate":
      return AgentEvent.statusUpdate(payload.value);
    case "artifactUpdate":
      return AgentEvent.artifactUpdate(payload.value);
    default:
      return undefined;
  }
}

function taskIdOfEvent(event: AgentExecutionEvent): string | undefined {
  switch (event.kind) {
    case "task":
      return event.data.id;
    case "statusUpdate":
    case "artifactUpdate":
      return event.data.taskId;
    case "message":
      return event.data.taskId || undefined;
  }
}

export class A2AClient implements RemoteClient {
  private clientFactory: ClientFactory;
  private agentCard: AgentCard | undefined;
  private client: Client | undefined;
  private taskMap = new Map<
    string,
    | {
        task: Task;
        tokenSetProvider: TokenSetProvider | undefined;
        createdAt: number;
      }
    | undefined
  >();

  constructor(
    public connectionOptions: schemas.AgentWithId,
    public tokenSetProvider: TokenSetProvider | undefined
  ) {
    this.clientFactory = this.buildClientFactory(tokenSetProvider);
  }

  public get id(): string {
    return this.connectionOptions.id;
  }

  public get isConnected(): boolean {
    return this.client !== undefined && this.agentCard !== undefined;
  }

  public get isStateful(): boolean {
    return false;
  }

  public async connectClient(): Promise<void> {
    if (!this.connectionOptions.disabled) {
      await this.pingClient();
    }
  }

  public async pingClient(): Promise<void> {
    if (this.connectionOptions.disabled) {
      return;
    }

    const log = logger().child({
      clientId: this.connectionOptions.id,
    });

    log.debug("Ping A2A client");

    try {
      const client = await this.connectToA2AServer();
      const agentCard = await client.getAgentCard();
      this.agentCard = agentCard;
      this.client = client;
    } catch (e) {
      log.child({ error: unknownToString(e) }).debug("Unable to get AgentCard");
      this.agentCard = undefined;
      this.client = undefined;
    }
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  public getAgentCard(): AgentCard | undefined {
    return this.agentCard;
  }

  public async cancelTask(
    taskId: string,
    eventBus: {
      publish(event: AgentExecutionEvent): void;
    }
  ): Promise<void> {
    const mappedClientTask = this.taskMap.get(taskId);
    const client = await this.connectToA2AServer(
      mappedClientTask ? mappedClientTask.tokenSetProvider : undefined
    );
    const failedUpdate = AgentEvent.statusUpdate({
      taskId: taskId,
      contextId: mappedClientTask?.task.contextId || "",
      status: {
        state: TaskState.TASK_STATE_FAILED,
        message: undefined,
        timestamp: undefined,
      },
      metadata: undefined,
    });

    if (!mappedClientTask) {
      eventBus.publish(failedUpdate);
      return;
    }

    try {
      const task = await client.cancelTask({
        tenant: "",
        id: mappedClientTask.task.id,
        metadata: undefined,
      });

      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId: taskId,
          contextId: task.contextId || mappedClientTask.task.contextId || "",
          status: task.status ?? {
            state: TaskState.TASK_STATE_CANCELED,
            message: undefined,
            timestamp: undefined,
          },
          metadata: undefined,
        })
      );
    } catch (err) {
      logger().child({ taskId: taskId }).error(err);
      eventBus.publish(failedUpdate);
    }
  }

  public async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    assertDefined(this.agentCard);

    const tokenSetProvider: TokenSetProvider | undefined =
      this.getUserAsAccessTokenTokenSetProvider(requestContext);

    const client = await this.connectToA2AServer(tokenSetProvider);
    const supportsStreaming = this.agentCard.capabilities?.streaming || false;
    const mappedClientTask = this.taskMap.get(requestContext.taskId);

    const request: SendMessageRequest = {
      tenant: "",
      message: {
        ...requestContext.userMessage,
        taskId: mappedClientTask?.task.id || "",
      },
      configuration: undefined,
      metadata: undefined,
    };

    if (supportsStreaming) {
      const stream = client.sendMessageStream(request);
      for await (const response of stream) {
        const event = streamResponseToAgentEvent(response);
        if (!event) {
          continue;
        }
        this.updateTaskMap(event, requestContext.taskId, tokenSetProvider);
        eventBus.publish(this.replaceTaskId(event, requestContext.taskId));
      }
    } else {
      const result = await client.sendMessage(request);
      const event =
        "id" in result ? AgentEvent.task(result) : AgentEvent.message(result);
      this.updateTaskMap(event, requestContext.taskId, tokenSetProvider);
      eventBus.publish(this.replaceTaskId(event, requestContext.taskId));
    }

    eventBus.finished();
  }

  public async sendMessage(
    request: SendMessageRequest,
    tokenSetProvider: TokenSetProvider | undefined,
    callback: (event: AgentExecutionEvent) => Promise<void>
  ) {
    const client = await this.connectToA2AServer(tokenSetProvider);

    if (!this.agentCard) {
      throw new Error(`Client Card not available`);
    }

    if (this.agentCard.capabilities?.streaming) {
      logger().child({ request }).debug("Send message stream");
      const stream = client.sendMessageStream(request);
      for await (const response of stream) {
        const event = streamResponseToAgentEvent(response);
        if (!event) {
          continue;
        }
        this.updateTaskMap(event, undefined, tokenSetProvider);
        await callback(event);
      }
    } else {
      logger().child({ request }).debug("Send message sync");
      const result = await client.sendMessage(request);
      const event =
        "id" in result ? AgentEvent.task(result) : AgentEvent.message(result);
      this.updateTaskMap(event, undefined, tokenSetProvider);
      await callback(event);
    }
  }

  private replaceTaskId(
    event: AgentExecutionEvent,
    taskId: string
  ): AgentExecutionEvent {
    switch (event.kind) {
      case "task":
        return AgentEvent.task({ ...event.data, id: taskId });
      case "statusUpdate":
        return AgentEvent.statusUpdate({ ...event.data, taskId });
      case "artifactUpdate":
        return AgentEvent.artifactUpdate({ ...event.data, taskId });
      case "message":
        return AgentEvent.message({ ...event.data, taskId });
    }
  }

  private updateTaskMap(
    event: AgentExecutionEvent,
    taskId: string | undefined,
    tokenSetProvider: TokenSetProvider | undefined
  ) {
    if (!taskId) {
      taskId = taskIdOfEvent(event);
    }
    if (!taskId) {
      return;
    }
    if (
      event.kind === "task" &&
      event.data.status?.state === TaskState.TASK_STATE_SUBMITTED
    ) {
      this.taskMap.set(taskId, {
        task: event.data,
        tokenSetProvider,
        createdAt: Date.now(),
      });
    }
    if (event.kind === "statusUpdate" || event.kind === "task") {
      const state = event.data.status?.state;
      if (state !== undefined && TERMINAL_TASK_STATES.has(state)) {
        this.taskMap.delete(taskId);
      }
    }
    // Sweep stale tasks
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [key, entry] of this.taskMap) {
      if (entry && now - entry.createdAt > TASK_TTL_MS) {
        // this.taskMap.delete(key);
        logger().info(`Possible stale taskMap identified ${entry.task.id}`);
      }
    }
  }
  private getUserAsAccessTokenTokenSetProvider(
    requestContext: RequestContext
  ): TokenSetProvider | undefined {
    const accessToken = requestContext.context?.user?.userName;
    if (!accessToken) {
      return undefined;
    } else {
      return () => Promise.resolve({ access_token: accessToken });
    }
  }

  private buildClientFactory(
    tokenSetProvider: TokenSetProvider | undefined
  ): ClientFactory {
    return new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        ...buildLegacyCompatOptions(),
        clientConfig: {
          interceptors: [
            new AuthInterceptor(this.connectionOptions, tokenSetProvider),
          ],
        },
      })
    );
  }

  private async connectToA2AServer(tokenSetProvider?: TokenSetProvider) {
    const clientFactory: ClientFactory = tokenSetProvider
      ? this.buildClientFactory(tokenSetProvider)
      : this.clientFactory;

    const agentCardUrl = new URL(
      ".well-known/agent-card.json",
      this.connectionOptions.serverUrl.replace(/\/?$/, "/")
    );

    return await clientFactory.createFromUrl(agentCardUrl.toString(), "");
  }
}
