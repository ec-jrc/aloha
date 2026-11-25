/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the “Licence”);
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/

// const fetchCache = () => injector.resolve("fetchCache");

import { SendMessageRequest, TaskState } from "@a2a-js/sdk";
import { AgentEvent } from "@a2a-js/sdk/server";
import {
  authentication_strategy,
  endpoints_schemas,
  // endpoints_schemas,
  schemas,
} from "aloha-shared";
import { Request, Response } from "express";
import { z } from "zod";
import { A2AClient } from "../connections/a2a-client";
import MCPClient from "../connections/mcp-client";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { authorise } from "../middleware/authorise";
import {
  AGENT_PROJECT,
  createJwtToken,
} from "../middleware/jwt-authentication";
import { buildTokenSetProviderFromSession } from "../middleware/oidc/oidc-support";
import { findCachedUsersById } from "../utils/cache.utils";
import { stringComparer } from "../utils/sort-comparators";
import { assertFieldInObject } from "../utils/type-utils";
import {
  crudGenerator,
  HTTPError,
  permissionsManagerGenerator,
  validateRequestBody,
  verifyPermission,
} from "./utils";

const logger = getLogger("AGENT");

const agentRepository = () => injector().resolve("agentRepository");
const mcpManager = () => injector().resolve("mcpManager");
const fetchCache = () => injector().resolve("fetchCache");
const metricsProvider = () => injector().resolve("metricsProvider");

export function agentRoutes() {
  logger().debug("Registering agents router");

  const router = crudGenerator<schemas.Agent>({
    name: "agent",
    logger: logger,
    repository: agentRepository,
    schema: schemas.AgentSchema,
    readPermissions: [authentication_strategy.Permissions.AgentsRead],
    writePermissions: [authentication_strategy.Permissions.AgentsWrite],
    endpoints: {
      list: {
        enableCache: false,
        factory: async (req) => {
          const agents = await agentRepository().findByPattern({});

          const permitted = (
            await Promise.all(
              agents.map(async (agent) =>
                (await verifyPermission(agent, req, "read")) ? agent : null
              )
            )
          ).filter((s) => s !== null);

          permitted.sort(stringComparer("name"));

          const detailedAgents: endpoints_schemas.AgentListDetail[] =
            permitted.map(({ id, ...agentOptions }) => {
              const client = mcpManager().getConnection(id);
              const server = mcpManager().getServer(id);
              return {
                ...agentOptions,
                id: id,
                isConnected: !!client && client.isConnected && !!server,
                tools:
                  client && client instanceof MCPClient
                    ? client.tools.length
                    : 0,
              };
            });

          return detailedAgents;
        },
      },
      get: {
        enableCache: false,
        factory: async (req) => {
          assertFieldInObject(req.params, "id", z.string());
          const id = req.params.id;
          const agentInfo = await agentRepository().findById(id);

          if (!agentInfo) {
            throw new HTTPError(404, "Agent not found");
          }

          const connection = mcpManager().getConnection(id);

          await verifyPermission(agentInfo, req, "read", true);

          return {
            ...agentInfo,
            isConnected: connection && connection.isConnected,
            tools: connection instanceof MCPClient ? connection.tools : [],
            connectionsDetail: agentInfo.connections
              ?.map((sc) => {
                const connection = mcpManager().getConnection(sc);
                if (connection == undefined) return null;
                return {
                  id: sc,
                  name: connection?.connectionOptions.name,
                  isConnected: connection?.isConnected,
                  type: connection.connectionOptions.type,
                  versioningInfo: connection?.connectionOptions.versioningInfo,
                };
              })
              .filter((sc) => sc !== null),
            metadata:
              agentInfo.serverProtocol === "a2a" &&
              connection instanceof A2AClient
                ? { agentCard: connection.getAgentCard() }
                : {},
          };
          // return result as schemas.MCPServerOptions;
        },
      },
      create: async (req) => {
        const agentData = req.body as schemas.Agent;
        if (!agentData.serverPath.startsWith("agent-")) {
          agentData.serverPath = `agent-${agentData.serverPath}`;
        }
        const agentWithSamePath = await agentRepository().findByPattern({
          serverPath: agentData.serverPath,
        });

        if (agentWithSamePath.length > 0) {
          throw new HTTPError(409, "Agent Server Path already used");
        }

        // Ensure visibility is set to a default value if not provided
        const visibility = agentData.visibility ?? schemas.Visibility.Private;

        // Ensure that the creator is set to the user requesting the creation
        // if (!authentication_strategy.isUserAuthenticated(req)) {
        //   throw new HTTPError(500, "Could not resolve the logged user");
        // }

        const user = authentication_strategy.getUserFromSession(req);
        const loggedUser = await findCachedUsersById(user.id);
        if (!loggedUser) {
          throw new HTTPError(500, "Could not resolve the logged user");
        }

        const inserted: schemas.AgentWithId = await agentRepository().create({
          ...agentData,
          visibility,
          creator: loggedUser.id,
        });

        if (!inserted) {
          throw new HTTPError(
            500,
            "Could not create the Agent in the database"
          );
        }

        // Create both a connection and a server for this agent
        const tokenSetProvider = injector().resolve(
          "oidcAlohaTokenSetProvider"
        );
        mcpManager().createConnection(inserted, tokenSetProvider);
        mcpManager().createServer(inserted);

        return inserted;
      },
      update: async (req) => {
        assertFieldInObject(req.params, "id", z.string());
        const id = req.params.id;
        const newAgentOptions = req.body as Partial<schemas.Agent>;
        const agentWithSamePath = await agentRepository().findByPattern({
          serverPath: newAgentOptions.serverPath,
        });

        if (
          agentWithSamePath.length > 0 &&
          agentWithSamePath.find((e) => e.id === id) === undefined
        ) {
          throw new HTTPError(409, "Agent Server Path already used");
        }

        const agentOption = await agentRepository().findById(id);

        if (agentOption === null) {
          throw new HTTPError(404, "Agent not found");
        }

        await verifyPermission(agentOption, req, "write", true);

        // Ensure visibility is set to a default value if not provided
        if (!newAgentOptions.visibility) {
          newAgentOptions.visibility = schemas.Visibility.Private;
        }

        // If the server does not have a creator, set it now
        let creator = agentOption.creator;

        const user = authentication_strategy.getUserFromSession(req);
        if (
          !creator &&
          user.permissions.includes(
            authentication_strategy.Permissions.Administration
          )
        ) {
          const loggedUser = await findCachedUsersById(user.id);
          if (!loggedUser) {
            throw new HTTPError(500, "Could not resolve the logged user");
          }
          creator = loggedUser.id;
        }

        const performed = await agentRepository().updateById(id, {
          ...newAgentOptions,
          creator,
          type: "agent",
        });
        if (!performed) return false;
        const agentOptions = await agentRepository().findById(id);
        if (agentOptions) {
          await mcpManager().reloadConnection(agentOptions);
          return true;
        } else {
          return false;
        }
      },
      delete: async (req) => {
        assertFieldInObject(req.params, "id", z.string());
        const id = req.params.id;
        const agent = await agentRepository().findById(id);

        if (agent === null) {
          throw new HTTPError(404, "Agent not found");
        }
        await verifyPermission(agent, req, "write", true);

        const deleted = await agentRepository().deleteById(id);
        if (deleted) {
          await mcpManager().removeConnection(id);
          await mcpManager().removeServer(id);
        }
        return deleted;
      },
    },
  });

  router.get(
    "/:id/_token",
    authorise([authentication_strategy.Permissions.AgentsWrite]),
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const log = logger().child({ agentId: id });
      log.debug("Create token for agent creator");

      try {
        const agent = await agentRepository().findById(id);
        if (!agent) {
          res.status(404).json({ error: "Agent not found" });
          return;
        }

        await verifyPermission(agent, req, "read");

        const creatorUser = await findCachedUsersById(agent.creator);
        if (!creatorUser) {
          res.status(404).json({ error: "Creator user not found" });
          return;
        }

        // if (!authentication_strategy.isUserAuthenticated(req)) {
        //   throw new HTTPError(500, "Could not resolve the logged user");
        // }
        const user = authentication_strategy.getUserFromSession(req);

        if (user.id !== creatorUser.id && user.id !== creatorUser.userId) {
          res.status(403).json({
            error:
              "Only the creator of an agent can issue tokens for the agent",
          });
          return;
        }

        const tokenRepository = () => injector().resolve("tokenRepository");
        // Delete all existing tokens for this agent
        const existing = await tokenRepository().findByPattern({
          userId: agent.id,
        });
        for (const existing_token of existing) {
          await tokenRepository().deleteById(existing_token.id);
        }

        // Create token without project association for agents
        const newToken = await tokenRepository().create({
          userId: agent.id,
          permissions: [authentication_strategy.Permissions.ProxyApiAccess],
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          projectId: AGENT_PROJECT,
          disabled: false,
        });

        const jwt = await createJwtToken(newToken);
        fetchCache().clear();
        res.send({ token: jwt }).end();
      } catch (e) {
        log.error(e);
        res
          .status(500)
          .json({ error: "Failed to create access token for the agent" });
      }
    }
  );

  // Associate a client to a server
  router.post(
    "/:id/_connect/:cid",
    authorise([authentication_strategy.Permissions.AgentsWrite]),
    async (req: Request, res: Response) => {
      // assertFieldInObject(req.params, "id", z.string());
      // assertFieldInObject(req.params, "cid", z.string());
      const { id, cid } = req.params;

      const log = logger().child({ serverId: id, connectionId: cid });
      log.debug("Associate connection to Agent");

      try {
        if (!id) {
          log.error("Must provide the id of the Agent to update");
          res
            .status(400)
            .json({ error: "Must provide the id of the Agent to update" });
          return;
        }
        if (!cid) {
          log.error("Must provide the id of the client to connect");
          res
            .status(400)
            .json({ error: "Must provide the id of the client to connect" });
          return;
        }
        const server = mcpManager().getServer(id);
        if (!server) {
          res.status(404).json({ error: "Agent not found" });
          return;
        }

        await verifyPermission(server.options, req, "write", true);
        const repos = [
          injector().resolve("connectionOptionsRepository"),
          injector().resolve("agentRepository"),
        ];
        const connectionOption = (
          await Promise.all(repos.map((e) => e.findById(cid)))
        ).find(Boolean);

        if (!connectionOption) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }
        if (server.options.connections?.includes(cid)) {
          res.status(204).end();
          return;
        }

        await verifyPermission(connectionOption, req, "read", true);

        const result = await agentRepository().addNewConnection(id, cid);

        if (result) {
          server.options.connections?.push(cid);
          fetchCache().clear();
          res.status(204).end();
        } else {
          res.status(404).json({ error: "Failed to update Agent" });
        }
      } catch (error) {
        log.error(error);
        if (error instanceof HTTPError) {
          res.status(error.errorCode).json({ error: error.message });
        } else {
          let errorMessage = "Failed to update Agent";
          if (
            error &&
            typeof error == "object" &&
            "message" in error &&
            typeof error.message == "string"
          ) {
            errorMessage = error.message;
          }
          res.status(500).json({ error: errorMessage });
        }
      }
    }
  );

  // Dissociate a client to a server
  router.post(
    "/:id/_disconnect/:cid",
    authorise([authentication_strategy.Permissions.AgentsWrite]),
    async (req: Request, res: Response) => {
      // assertFieldInObject(req.params, "id", z.string());
      // assertFieldInObject(req.params, "cid", z.string());
      const { id, cid } = req.params;

      const log = logger().child({ serverId: id, connectionId: cid });
      log.debug("Disconnect client from Agent");

      try {
        if (!id) {
          log.error("Must provide the id of the Agent to update");
          res
            .status(400)
            .json({ error: "Must provide the id of the Agent to update" });
          return;
        }
        if (!cid) {
          log.error("Must provide the id of the client to connect");
          res
            .status(400)
            .json({ error: "Must provide the id of the client to connect" });
          return;
        }
        const server = mcpManager().getServer(id);
        if (!server) {
          res.status(404).json({ error: "Agent not found" });
          return;
        }
        await verifyPermission(server.options, req, "write", true);

        if (!server.options.connections?.some((sc) => sc === cid)) {
          res.status(204).end();
          return;
        }
        const newConnections = server.options.connections?.filter(
          (sc) => sc !== cid
        );
        const result = await agentRepository().replaceConnections(
          id,
          newConnections
        );

        if (result) {
          server.options.connections = newConnections;
          fetchCache().clear();
          res.status(204).end();
        } else {
          res.status(404).json({ error: "Agent not found" });
        }
      } catch (error) {
        log.error(error);
        if (error instanceof HTTPError) {
          res.status(error.errorCode).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Failed to update Agent" });
        }
      }
    }
  );

  router.post(
    "/:id/unregisterWithIdentityPropagationService",
    authorise([authentication_strategy.Permissions.AgentsWrite]),
    async (req, res) => {
      assertFieldInObject(req.params, "id", z.string());
      const { id } = req.params;

      const idps = injector().resolve("oidcIdentityPropagationRegistrar");
      if (!idps) {
        logger().error("Identity Propagation Service Registrar not found");
        res
          .status(500)
          .json({ error: "Identity Propagation Service Registrar not found" })
          .end();
        return;
      }

      const identityPropagationServiceRegistrar = await idps;

      const agent = await agentRepository().findById(id);

      if (!agent) {
        res.status(404).json({ error: "Agent not found" }).end();
        return;
      }

      if (!(agent.authentication?.type === "oidc_client_secret")) {
        res
          .status(400)
          .json({ error: "Client authentication type is not supported" })
          .end();
        return;
      }
      try {
        await identityPropagationServiceRegistrar.unregisterClient(
          agent.authentication.clientId
        );
        res.status(204).end();
      } catch (error) {
        logger().child({ error }).error("Failed to unregister client");
        res.status(500).json({ error: "Failed to unregister client" });
      }
    }
  );

  router.post(
    "/:id/registerWithIdentityPropagationService",
    authorise([authentication_strategy.Permissions.AgentsWrite]),
    async (req, res) => {
      assertFieldInObject(req.params, "id", z.string());

      const { id } = req.params;

      const idps = injector().resolve("oidcIdentityPropagationRegistrar");

      if (!idps) {
        logger().error("Identity Propagation Service Registrar not found");
        res
          .status(500)
          .json({ error: "Identity Propagation Service Registrar not found" })
          .end();
        return;
      }

      const identityPropagationServiceRegistrar = await idps;

      const agent = await agentRepository().findById(id);

      if (!agent) {
        res.status(404).json({ error: "Agent not found" }).end();
        return;
      }

      if (!(agent.authentication?.type === "oidc_client_secret")) {
        res
          .status(400)
          .json({ error: "Client authentication type is not supported" })
          .end();
        return;
      }

      try {
        await identityPropagationServiceRegistrar.registerClient({
          client_id: agent.authentication.clientId,
          secret: agent.authentication.clientSecret,
          client_name: agent.name,
          redirect_uris: [],
          root_url: "",
        });
        res.status(204).end();
      } catch (error) {
        logger().child({ error }).error("Failed to register client");
        res.status(500).json({ error: "Failed to register client" });
      }
    }
  );
  router.get(
    "/:id/isRegisteredInIdentityPropagationService",
    authorise([authentication_strategy.Permissions.AgentsRead]),
    async (req, res) => {
      assertFieldInObject(req.params, "id", z.string());

      const { id } = req.params;

      const idps = injector().resolve("oidcIdentityPropagationService");

      if (!idps) {
        logger().error("Identity Propagation Service not found");
        res
          .status(500)
          .json({ error: "Identity Propagation Service not found" })
          .end();
        return;
      }

      const identityPropagationService = await idps;

      const registrar = injector().resolve("oidcIdentityPropagationRegistrar");

      if (!registrar) {
        res
          .json({
            registered: undefined,
          })
          .end();
        return;
      }

      const agent = await agentRepository().findById(id);

      if (!agent) {
        res.status(404).json({ error: "Agent not found" }).end();
        return;
      }

      if (!(agent.authentication?.type === "oidc_client_secret")) {
        res
          .status(400)
          .json({ error: "Client authentication type is not supported" })
          .end();
        return;
      }

      const clientId = agent.authentication.clientId;
      try {
        const registeredClient =
          await identityPropagationService.getClientRegistration(clientId);

        res
          .json({
            registered: registeredClient !== undefined,
          })
          .end();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        res
          .json({
            registered: false,
          })
          .end();
      }
    }
  );
  router.get(
    "/by_connection_id/:cid",
    authorise([authentication_strategy.Permissions.ServersRead]),
    async (req: Request, res: Response) => {
      // assertFieldInObject(req.params, "cid", z.string());
      const { cid } = req.params;

      const log = logger().child({ connectionId: cid });
      log.debug("Get agents bound to connection");

      try {
        if (!cid) {
          res.status(400).json({ error: "No connection id specified" });
          return;
        }

        const result = await agentRepository().findByConnectionId(cid);
        res.json(result).end();
        return;
      } catch (error) {
        log.error(error);
        res
          .status(500)
          .json({ error: "Failed to find agents by connection id" });
      }
    }
  );

  router.post(
    "/:agentId/cancelTask",
    validateRequestBody(z.object({ taskId: z.string() }), logger),
    authorise([authentication_strategy.Permissions.AgentsRead]),
    async (req, res) => {
      assertFieldInObject(req.params, "agentId", z.string());
      const { agentId } = req.params;
      const message = req.body as { taskId: string };
      const log = logger().child({ agentId, message });
      log.debug("Cancel task");

      const agent = await agentRepository().findById(agentId);
      if (!agent) {
        metricsProvider().debugA2aRequest(agentId, "task_cancel", false);
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const connection = mcpManager().getConnection(agentId, A2AClient);
      if (!connection) {
        metricsProvider().debugA2aRequest(agentId, "task_cancel", false);
        res.status(404).json({ error: "A2A Connection not found" });
        return;
      }

      try {
        await connection.cancelTask(message.taskId, {
          publish(event) {
            res.json(event).end();
          },
        });
        metricsProvider().debugA2aRequest(agentId, "task_cancel", true);
      } catch (error) {
        metricsProvider().debugA2aRequest(agentId, "task_cancel", false);
        throw error;
      }
    }
  );
  router.post(
    "/:agentId/sendA2AMessageStream",
    authorise([authentication_strategy.Permissions.AgentsRead]),
    async (req, res) => {
      assertFieldInObject(req.params, "agentId", z.string());
      const { agentId } = req.params;
      const request = req.body as SendMessageRequest;
      const log = logger().child({ agentId, request });
      log.debug("Send message to agent (streaming)");

      const agent = await agentRepository().findById(agentId);
      if (!agent) {
        metricsProvider().debugA2aRequest(agentId, "message_send", false);
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const connection = mcpManager().getConnection(agentId, A2AClient);
      if (!connection) {
        metricsProvider().debugA2aRequest(agentId, "message_send", false);
        res.status(404).json({ error: "A2A Connection not found" });
        return;
      }

      const tokenSetProvider = buildTokenSetProviderFromSession(req);
      let contextId: string | undefined;
      let taskId: string | undefined;
      let success = true;
      try {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        await connection.sendMessage(request, tokenSetProvider, (event) => {
          log.child({ event }).debug("Event");
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (!contextId) {
            contextId = event.data.contextId;
          }
          if (!taskId) {
            taskId = event.kind === "task" ? event.data.id : event.data.taskId;
          }
          return Promise.resolve();
        });
      } catch (error) {
        success = false;
        log.error(error);
        const msg = AgentEvent.statusUpdate({
          taskId: taskId || "",
          contextId: contextId || "",
          status: {
            state: TaskState.TASK_STATE_FAILED,
            message: undefined,
            timestamp: undefined,
          },
          metadata: {
            error: "Failed to send message to agent, check the server logs",
            detail: error instanceof Error ? error.message : String(error),
          },
        });
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      } finally {
        metricsProvider().debugA2aRequest(agentId, "message_send", success);
        res.end();
      }
    }
  );

  permissionsManagerGenerator({
    router,
    name: "agents",
    repository: agentRepository,
    logger,
    writePermissions: [authentication_strategy.Permissions.ServersWrite],
    afterVisibilityChangeCallback: async (id, visibility) => {
      const connection = mcpManager().getConnection(id)!;
      const server = mcpManager().getServer(id)!;

      connection.connectionOptions.disabled = visibility.disabled;
      connection.connectionOptions.visibility = visibility.visibility;

      server.options.disabled = visibility.disabled;
      server.options.visibility = visibility.visibility;

      await mcpManager().reloadConnection(connection.connectionOptions);
      await mcpManager().reloadServer(server.options);
    },
  });

  return router;
}
