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
  MessageSendParams,
  Task,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import {
  BeforeArgs,
  CallInterceptor,
  Client,
  ClientFactory,
  ClientFactoryOptions,
} from "@a2a-js/sdk/client";
import {
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
    this.clientFactory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        clientConfig: {
          interceptors: [
            new AuthInterceptor(connectionOptions, tokenSetProvider),
          ],
        },
      })
    );
  }

  public get id(): string {
    return this.connectionOptions.id;
  }

  public get isConnected(): boolean {
    // logger()
    //   .child({
    //     clientId: this.connectionOptions.id,
    //     client: this.client !== undefined,
    //     agentCard: this.agentCard,
    //   })
    //   .info("isConnected");
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

  public getAgentCard() {
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
    const updateMessage: TaskStatusUpdateEvent = {
      kind: "status-update",
      taskId: taskId,
      final: true,
      contextId: mappedClientTask?.task.contextId || "",
      status: {
        state: "failed",
      },
    };

    if (!mappedClientTask) {
      eventBus.publish(updateMessage);
      return;
    }

    try {
      const task = await client.cancelTask({ id: mappedClientTask.task.id });

      eventBus.publish({
        ...updateMessage,
        status: task.status,
      });
    } catch (err) {
      logger().child({ taskId: taskId }).error(err);
      eventBus.publish(updateMessage);
    }
  }

  public async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    assertDefined(this.agentCard);

    const tokenSetProvider: TokenSetProvider | undefined =
      this.getUserTokenSet(requestContext);

    const client = await this.connectToA2AServer(tokenSetProvider);
    const supportsStreaming = this.agentCard.capabilities.streaming || false;
    const mappedClientTask = this.taskMap.get(requestContext.taskId);

    if (supportsStreaming) {
      const stream = client.sendMessageStream({
        message: {
          ...requestContext.userMessage,
          taskId: mappedClientTask?.task.id,
        },
      });
      for await (const event of stream) {
        this.updateTaskMap(event, requestContext.taskId, tokenSetProvider);
        eventBus.publish(this.replaceTaskId(event, requestContext.taskId));
      }
    } else {
      const result = await client.sendMessage({
        message: {
          ...requestContext.userMessage,
          taskId: mappedClientTask?.task.id,
        },
      });

      this.updateTaskMap(result, requestContext.taskId, tokenSetProvider);
      eventBus.publish(this.replaceTaskId(result, requestContext.taskId));
    }

    eventBus.finished();
  }

  public async sendMessage(
    message: MessageSendParams,
    tokenSetProvider: TokenSetProvider | undefined,
    callback: (event: AgentExecutionEvent) => Promise<void>
  ) {
    const client = await this.connectToA2AServer(tokenSetProvider);

    if (!this.agentCard) {
      throw new Error(`Client Card not available`);
    }

    if (this.agentCard.capabilities.streaming) {
      logger().child({ message }).debug("Send message stream");
      const stream = client.sendMessageStream(message);
      for await (const event of stream) {
        this.updateTaskMap(event, undefined, tokenSetProvider);
        await callback(event);
      }
    } else {
      logger().child({ message }).debug("Send message sync");
      const result = await client.sendMessage(message);
      await callback(result);
    }
  }

  private replaceTaskId(event: AgentExecutionEvent, taskId: string) {
    return {
      ...event,
      ...(event.kind === "task" ? { id: taskId } : { taskId: taskId }),
    };
  }

  private updateTaskMap(
    event: AgentExecutionEvent,
    taskId: string | undefined,
    tokenSetProvider: TokenSetProvider | undefined
  ) {
    if (!taskId) {
      if (event.kind === "task") {
        taskId = event.id;
      } else {
        taskId = event.taskId;
      }
    }
    if (!taskId) {
      return;
    }
    if (event.kind === "task" && event.status.state === "submitted") {
      this.taskMap.set(taskId, {
        task: event,
        tokenSetProvider,
        createdAt: Date.now(),
      });
    }
    if (event.kind === "status-update" || event.kind === "task") {
      switch (event.status.state) {
        case "completed":
        case "canceled":
        case "failed":
        case "rejected":
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
  private getUserTokenSet(
    requestContext: RequestContext
  ): TokenSetProvider | undefined {
    const accessToken = requestContext.context?.user?.userName;
    if (!accessToken) {
      return undefined;
    } else {
      return () => Promise.resolve({ access_token: accessToken });
    }
  }

  private async connectToA2AServer(tokenSetProvider?: TokenSetProvider) {
    let clientFactory: ClientFactory;
    if (tokenSetProvider) {
      clientFactory = new ClientFactory(
        ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
          clientConfig: {
            interceptors: [
              new AuthInterceptor(this.connectionOptions, tokenSetProvider),
            ],
          },
        })
      );
    } else {
      clientFactory = this.clientFactory;
    }

    const agentCardUrl = new URL(
      ".well-known/agent-card.json",
      this.connectionOptions.serverUrl.replace(/\/?$/, "/")
    );

    return await clientFactory.createFromUrl(agentCardUrl.toString(), "");
  }
}
