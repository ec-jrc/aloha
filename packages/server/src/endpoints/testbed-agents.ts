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

import {
  authentication_strategy,
  endpoints_schemas,
  // endpoints_schemas,
  schemas,
} from "aloha-shared";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { crudGenerator, HTTPError, verifyPermission } from "./utils";
// import { z } from "zod";
import { Request, Response } from "express";
import { z } from "zod";
import { authorise } from "../middleware/authorise";
import { stringComparer } from "../utils/sort-comparators";
import { assertFieldInObject } from "../utils/type-utils";
import { findCachedUsersById } from "../utils/cache.utils";
const logger = getLogger("TESTBED-AGENT");

const testbedAgentRepository = () =>
  injector().resolve("testbedAgentRepository");
const mcpManager = () => injector().resolve("mcpManager");
const fetchCache = () => injector().resolve("fetchCache");
const agentRepository = () => injector().resolve("agentRepository");
const clientRepository = () =>
  injector().resolve("connectionOptionsRepository");

export function testbedAgentRoutes() {
  logger().debug("Registering testbed agents router");

  const router = crudGenerator<schemas.TestbedAgent>({
    name: "testbedAgent",
    logger: logger,
    repository: testbedAgentRepository,
    schema: schemas.TestbedAgentSchema,
    readPermissions: [authentication_strategy.Permissions.AgentsRead],
    writePermissions: [authentication_strategy.Permissions.AgentsWrite],
    endpoints: {
      list: {
        enableCache: false,
        factory: async (req) => {
          const currentUserId =
            authentication_strategy.getUserFromSession(req).id;

          const agents = await testbedAgentRepository().findByPattern({
            creator: currentUserId,
          });

          agents.sort(stringComparer("name"));

          return agents;
        },
      },
      get: {
        enableCache: false,
        factory: async (req) => {
          assertFieldInObject(req.params, "id", z.string());
          const id = req.params.id;
          const agentInfo = await testbedAgentRepository().findById(id);

          if (!agentInfo) {
            throw new HTTPError(404, "TestbedAgent not found");
          }

          await verifyPermission(agentInfo, req, "read", true);

          return {
            ...agentInfo,
            connectionsDetail: (
              await Promise.all(
                (agentInfo.connections || []).map(async (sc) => {
                  let data: {
                    name: string;
                    isConnected: boolean;
                    type: string;
                    versioningInfo?: schemas.MCPConnectionOptions["versioningInfo"];
                  };

                  const connection = mcpManager().getConnection(sc);

                  if (connection) {
                    data = {
                      name: connection.connectionOptions.name,
                      isConnected: connection.isConnected,
                      type: connection.connectionOptions.type,
                      versioningInfo:
                        connection.connectionOptions.versioningInfo,
                    };
                  } else {
                    const testbedAgentDetail =
                      await testbedAgentRepository().findById(sc);

                    if (testbedAgentDetail) {
                      data = {
                        name: testbedAgentDetail.name,
                        isConnected: true,
                        type: "testbedAgent",
                      };
                    } else {
                      return null;
                    }
                  }
                  return {
                    ...data,
                    id: sc,
                  };
                })
              )
            ).filter((sc) => sc !== null),
          } as endpoints_schemas.TestbedAgentWithIdAndDetail;
        },
      },
      create: async (req) => {
        const agentData = req.body as schemas.TestbedAgent;

        const visibility = schemas.Visibility.Private;

        const user = authentication_strategy.getUserFromSession(req);
        const loggedUser = await findCachedUsersById(user.id);
        if (!loggedUser) {
          throw new HTTPError(500, "Could not resolve the logged user");
        }

        const inserted = await testbedAgentRepository().create({
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

        return inserted;
      },
      update: async (req) => {
        assertFieldInObject(req.params, "id", z.string());
        const id = req.params.id;
        const newAgentOptions = req.body as Partial<schemas.TestbedAgent>;
        const agentOption = await testbedAgentRepository().findById(id);

        if (agentOption === null) {
          throw new HTTPError(404, "Agent not found");
        }

        await verifyPermission(agentOption, req, "write", true);

        newAgentOptions.visibility = schemas.Visibility.Private;

        // If the server does not have a creator, set it now
        let creator = newAgentOptions.creator;
        const user = authentication_strategy.getUserFromSession(req);
        if (
          !creator &&
          user?.permissions.includes(
            authentication_strategy.Permissions.Administration
          )
        ) {
          const loggedUser = await findCachedUsersById(user.id);
          if (!loggedUser) {
            throw new HTTPError(500, "Could not resolve the logged user");
          }
          creator = loggedUser.id;
        }

        const performed = await testbedAgentRepository().updateById(id, {
          ...newAgentOptions,
          creator,
        });
        if (!performed) return false;
        return true;
      },
      delete: async (req) => {
        assertFieldInObject(req.params, "id", z.string());
        const id = req.params.id;
        const agent = await testbedAgentRepository().findById(id);

        if (agent === null) {
          throw new HTTPError(404, "TestbedAgent not found");
        }
        await verifyPermission(agent, req, "write", true);

        const deleted = await testbedAgentRepository().deleteById(id);
        return deleted;
      },
    },
  });

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
        const server = await testbedAgentRepository().findById(id);
        if (!server) {
          res.status(404).json({ error: "TestbedAgent not found" });
          return;
        }

        await verifyPermission(server, req, "write", true);

        const connectionOptionPromise = clientRepository().findById(cid);
        const agentDetailPromise = agentRepository().findById(cid);
        const testbedAgentDetailPromise =
          testbedAgentRepository().findById(cid);

        const [connectionOption, agentDetail, testbedAgentDetail] =
          await Promise.all([
            connectionOptionPromise,
            agentDetailPromise,
            testbedAgentDetailPromise,
          ]);

        if (!connectionOption && !agentDetail && !testbedAgentDetail) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }

        if (server.connections?.includes(cid)) {
          res.status(204).end();
          return;
        }

        const objectToVerify =
          connectionOption || agentDetail || testbedAgentDetail;

        if (objectToVerify === null) {
          throw Error(`Object to connect cannot be null at this point`);
        }

        await verifyPermission(objectToVerify, req, "read", true);

        const result = await testbedAgentRepository().addNewConnection(id, cid);

        if (result) {
          server.connections?.push(cid);
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
        const server = await testbedAgentRepository().findById(id);
        if (!server) {
          res.status(404).json({ error: "TestbedAgent not found" });
          return;
        }
        await verifyPermission(server, req, "write", true);

        if (!server.connections?.some((sc) => sc === cid)) {
          res.status(204).end();
          return;
        }
        const newConnections = server.connections?.filter((sc) => sc !== cid);
        const result = await testbedAgentRepository().replaceConnections(
          id,
          newConnections
        );

        if (result) {
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

  router.get(
    "/by_connection_id/:cid",
    authorise([authentication_strategy.Permissions.ServersRead]),
    async (req: Request, res: Response) => {
      // assertFieldInObject(req.params, "cid", z.string());
      const { cid } = req.params;

      const log = logger().child({ connectionId: cid });
      log.debug("Get testbed agents bound to connection");

      try {
        if (!cid) {
          res.status(400).json({ error: "No connection id specified" });
          return;
        }

        const result = await testbedAgentRepository().findByConnectionId(cid);
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

  return router;
}
