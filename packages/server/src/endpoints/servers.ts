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

import {
  authentication_strategy,
  endpoints_schemas,
  schemas,
} from "aloha-shared";
import { Request, Response } from "express";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { authorise } from "../middleware/authorise";
import { stringComparer } from "../utils/sort-comparators";
import {
  crudGenerator,
  HTTPError,
  permissionsManagerGenerator,
  verifyPermission,
} from "./utils";
import { assertDefined, assertFieldInObject } from "../utils/type-utils";
import z from "zod";
import { findCachedUsersById } from "../utils/cache.utils";

const mcpManager = () => injector().resolve("mcpManager");

const logger = getLogger("SERVERS");
const repository = () => injector().resolve("serverOptionsRepository");

const fetchCache = () => injector().resolve("fetchCache");

export function serverRoutes() {
  logger().debug("Registering server router");

  async function reloadServer(id: string) {
    const updatedServerOption = await repository().findById(id);
    assertDefined(updatedServerOption);
    await mcpManager().reloadServer(updatedServerOption);
  }

  const router = crudGenerator({
    name: "server",
    logger: logger,
    repository,
    schema: schemas.MCPServerOptionsSchema,
    readPermissions: [authentication_strategy.Permissions.ServersRead],
    writePermissions: [authentication_strategy.Permissions.ServersWrite],
    endpoints: {
      list: {
        enableCache: false,
        factory: async (req) => {
          const serverOptions = await repository().findByPattern({});

          const permitted = (
            await Promise.all(
              serverOptions.map(async (server) =>
                (await verifyPermission(server, req, "read")) ? server : null
              )
            )
          ).filter((s) => s !== null);

          permitted.sort(stringComparer("name"));

          const detailedServers = permitted.map(({ id, ...serverOptions }) => {
            const server = mcpManager().getServer(id);
            return {
              ...serverOptions,
              id: id,
              isOnline: !!server,
            };
          });

          return detailedServers;
        },
      },
      get: {
        enableCache: false,
        factory: async (req) => {
          assertFieldInObject(req.params, "id", z.string());
          const id = req.params.id;
          const serverOptions = await repository().findById(id);

          if (!serverOptions) {
            throw new HTTPError(404, "Server not found");
          }

          await verifyPermission(serverOptions, req, "read", true);

          const result = {
            ...serverOptions,
            connectionsDetail: serverOptions.connections
              ?.map((sc) => {
                const connection = mcpManager().getConnection(sc);
                if (connection == undefined) return null;
                return {
                  id: sc,
                  name: connection?.connectionOptions.name,
                  isConnected: connection?.isConnected,
                  type: connection?.connectionOptions.type,
                  versioningInfo: connection?.connectionOptions.versioningInfo,
                };
              })
              .filter((sc) => sc !== null),
          } as endpoints_schemas.MCPServerOptionsDetail;
          return result;
        },
      },
      create: async (req) => {
        const newServerData = req.body as schemas.MCPServerOptions;
        const serverWithSamePath = await repository().findByPattern({
          serverPath: newServerData.serverPath,
        });

        if (serverWithSamePath.length > 0) {
          throw new HTTPError(409, "Server Path already used");
        }

        // Ensure visibility is set to a default value if not provided
        const visibility =
          newServerData.visibility ?? schemas.Visibility.Private;

        // Ensure that the creator is set to the user requesting the creation

        // if (!authentication_strategy.isUserAuthenticated(req)) {
        //   throw new HTTPError(500, "Could not resolve the logged user");
        // }

        const user = authentication_strategy.getUserFromSession(req);
        const loggedUser = await findCachedUsersById(user.id);
        if (!loggedUser) {
          throw new HTTPError(500, "Could not resolve the logged user");
        }

        const inserted = await repository().create({
          ...newServerData,
          visibility,
          creator: loggedUser.id,
        });

        if (!inserted) {
          throw new HTTPError(
            500,
            "Could not create the server in the database"
          );
        }

        mcpManager().createServer(inserted);
        return inserted;
      },
      update: async (req) => {
        assertFieldInObject(req.params, "id", z.string());
        const id = req.params.id;
        const newServerOptions = req.body as Partial<schemas.MCPServerOptions>;
        const serverWithSamePath = await repository().findByPattern({
          serverPath: newServerOptions.serverPath,
        });

        if (
          serverWithSamePath.length > 0 &&
          serverWithSamePath.find((e) => e.id === id) === undefined
        ) {
          throw new HTTPError(409, "Server Path already used");
        }

        const serverOption = await repository().findById(id);

        if (serverOption === null) {
          throw new HTTPError(404, "Server not found");
        }

        await verifyPermission(serverOption, req, "write", true);

        // Ensure visibility is set to a default value if not provided
        if (!newServerOptions.visibility) {
          newServerOptions.visibility = schemas.Visibility.Private;
        }

        // If the server does not have a creator, set it now
        let creator = serverOption.creator;
        // if (!authentication_strategy.isUserAuthenticated(req)) {
        //   throw new HTTPError(500, "Could not resolve the logged user");
        // }
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

        const success = await repository().updateById(id, {
          ...newServerOptions,
          creator,
        });

        await reloadServer(id);

        return success;
      },
      delete: async (req) => {
        assertFieldInObject(req.params, "id", z.string());
        const id = req.params.id;
        const serverOption = await repository().findById(id);

        if (serverOption === null) {
          throw new HTTPError(404, "Server not found");
        }
        await verifyPermission(serverOption, req, "write", true);

        const deleted = await repository().deleteById(id);
        if (deleted) {
          await mcpManager().removeServer(id);
        }
        return deleted;
      },
    },
  });

  // Associate a client to a server
  router.post(
    "/:id/_connect/:cid",
    authorise([authentication_strategy.Permissions.ServersWrite]),
    async (req: Request, res: Response) => {
      assertFieldInObject(req.params, "id", z.string());
      assertFieldInObject(req.params, "cid", z.string());
      const { id, cid } = req.params;

      const log = logger().child({ serverId: id, connectionId: cid });
      log.debug("Associate connection to server");

      try {
        if (!id) {
          log.error("Must provide the id of the server to update");
          res
            .status(400)
            .json({ error: "Must provide the id of the server to update" });
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
          res.status(404).json({ error: "Server not found" });
          return;
        }

        await verifyPermission(server.options, req, "write", true);

        const connectionOption = mcpManager().getConnection(cid);
        if (!connectionOption) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }
        if (server.options.connections?.includes(cid)) {
          res.status(204).end();
          return;
        }

        await verifyPermission(
          connectionOption.connectionOptions,
          req,
          "read",
          true
        );

        const result = await repository().addNewConnection(id, cid);

        if (result) {
          await reloadServer(id);
          fetchCache().clear();
          res.status(204).end();
        } else {
          res.status(404).json({ error: "Failed to update server" });
        }
      } catch (error) {
        log.error(error);
        if (error instanceof HTTPError) {
          res.status(error.errorCode).json({ error: error.message });
        } else {
          let errorMessage = "Failed to update server";
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
    authorise([authentication_strategy.Permissions.ServersWrite]),
    async (req: Request, res: Response) => {
      assertFieldInObject(req.params, "id", z.string());
      assertFieldInObject(req.params, "cid", z.string());
      const { id, cid } = req.params;

      const log = logger().child({ serverId: id, connectionId: cid });
      log.debug("Disconnect client from server");

      try {
        if (!id) {
          log.error("Must provide the id of the server to update");
          res
            .status(400)
            .json({ error: "Must provide the id of the server to update" });
          return;
        }
        if (!cid) {
          log.error("Must provide the id of the client to connect");
          res
            .status(400)
            .json({ error: "Must provide the id of the client to connect" });
          return;
        }
        const server = await repository().findById(id);
        if (!server) {
          res.status(404).json({ error: "Server not found" });
          return;
        }
        await verifyPermission(server, req, "write", true);

        if (!server.connections?.some((sc) => sc === cid)) {
          res.status(204).end();
          return;
        }
        const newConnections = server.connections?.filter((sc) => sc !== cid);
        const result = await repository().replaceConnections(
          id,
          newConnections
        );

        if (result) {
          await reloadServer(id);
          fetchCache().clear();
          res.status(204).end();
        } else {
          res.status(404).json({ error: "Server not found" });
        }
      } catch (error) {
        log.error(error);
        if (error instanceof HTTPError) {
          res.status(error.errorCode).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Failed to update server" });
        }
      }
    }
  );

  router.get(
    "/by_connection_id/:cid",
    authorise([authentication_strategy.Permissions.ServersRead]),
    async (req: Request, res: Response) => {
      assertFieldInObject(req.params, "cid", z.string());
      const { cid } = req.params;

      const log = logger().child({ connectionId: cid });
      log.debug("Get servers bound to connection");

      try {
        if (!cid) {
          res.status(400).json({ error: "No connection id specified" });
          return;
        }

        const result = await repository().findByConnectionId(cid);
        res.json(result).end();
        return;
      } catch (error) {
        log.error(error);
        res
          .status(500)
          .json({ error: "Failed to find server by connection id" });
      }
    }
  );

  permissionsManagerGenerator({
    router,
    name: "servers",
    repository,
    logger,
    writePermissions: [authentication_strategy.Permissions.ServersWrite],
    afterVisibilityChangeCallback: (id, visibility) => {
      const server = mcpManager().getServer(id)!;
      server.options.disabled = visibility.disabled;
      server.options.visibility = visibility.visibility;
      return Promise.resolve();
    },
  });

  return router;
}
