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

import { AGENT_CARD_PATH, A2A_PROTOCOL_VERSION, AgentCard } from "@a2a-js/sdk";
import {
  AgentExecutor,
  DefaultRequestHandler,
  InMemoryTaskStore,
  User,
} from "@a2a-js/sdk/server";
import {
  jsonRpcHandler,
  restHandler,
  UserBuilder,
} from "@a2a-js/sdk/server/express";
import { schemas } from "aloha-shared";
import * as express from "express";
import { serveRegistry } from "../endpoints/servers-proxy-utils";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { A2AClient } from "./a2a-client";

const logger = getLogger("A2A-SERVER");
const mcpManager = () => injector().resolve("mcpManager");
export class A2AServer {
  public router: express.Router = express.Router();
  public basePathToServe!: string;

  constructor(public options: schemas.AgentWithId) {}

  public get id() {
    return this.options.id;
  }

  registry(req: express.Request, res: express.Response) {
    return serveRegistry(req, res, this);
  }

  public serve(basePathToServe: string) {
    this.basePathToServe = basePathToServe;
    const log = logger().child({
      id: this.options.id,
    });
    log.debug("Proxy A2A Server");

    const client = mcpManager().getConnection(this.options.id, A2AClient);
    if (!client) {
      log.error("Unable to load the A2AClient");
      return;
    }

    const agentCard = client.getAgentCard();
    if (!agentCard) {
      log.error("Unable to get the A2AClient Agent Card");
      return;
    }

    const executor: AgentExecutor = {
      async cancelTask(taskId, eventBus) {
        await client.cancelTask(taskId, eventBus);
      },
      async execute(requestContext, eventBus) {
        await client.execute(requestContext, eventBus);
      },
    };
    const requestHandler = new DefaultRequestHandler(
      agentCard,
      new InMemoryTaskStore(),
      executor
    );

    const DynamicAgentCardHandler = (
      req: express.Request,
      res: express.Response
    ) => {
      const url = `${req.protocol}://${req.host}`;
      const jsonRpcUrl = `${url}${basePathToServe}/jsonrpc`;
      const restUrl = `${url}${basePathToServe}/rest`;
      const dynamicCard: AgentCard = {
        ...agentCard,
        supportedInterfaces: [
          {
            url: jsonRpcUrl,
            protocolBinding: "JSONRPC",
            tenant: "",
            protocolVersion: A2A_PROTOCOL_VERSION,
          },
          {
            url: restUrl,
            protocolBinding: "HTTP+JSON",
            tenant: "",
            protocolVersion: A2A_PROTOCOL_VERSION,
          },
        ],
        capabilities: {
          ...(agentCard.capabilities ?? {
            streaming: false,
            extensions: [],
          }),
          pushNotifications: false,
        },
      };
      return res.json(dynamicCard);
    };

    const userBuilder: UserBuilder =
      this.options.authentication?.type === "oidc_client_secret"
        ? (req: express.Request): Promise<User> => {
            const authorization = req.headers["authorization"] as string;
            if (authorization) {
              const parts = authorization.split(" ");
              const token = parts[1] || "";
              const user: User = {
                userName: token,
                isAuthenticated: true,
              };
              return Promise.resolve(user);
            }
            return UserBuilder.noAuthentication();
          }
        : UserBuilder.noAuthentication;

    this.router.use(
      `/jsonrpc`,
      jsonRpcHandler({
        requestHandler,
        userBuilder,
      })
    );

    this.router.use(`/rest`, restHandler({ requestHandler, userBuilder }));

    this.router.use(`/${AGENT_CARD_PATH}`, DynamicAgentCardHandler);

    this.router.use(`/`, DynamicAgentCardHandler);
  }

  public async close(): Promise<void> {}
}
