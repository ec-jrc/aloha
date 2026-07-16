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
import { json, Router } from "express";

import {
  isPluginWorkflow,
  PluginInitContext,
  PluginRuntimeInjector,
  PluginUserInfo,
  PluginWorkflow,
} from "@aloha-plugins/definitions/plugins-types";

import {
  getPluginExtraWithDefault,
  setPluginExtra,
} from "@aloha-plugins/plugins-utils";

import type { ConnectionOptionsRepository } from "@aloha-repositories/connection-options-repository";
import {
  repositoryWriteDecorate,
  visibilityRepositoryDecorate,
} from "@aloha-repositories/decorators/respository-write-decorators";
import {
  authentication_strategy,
  schemas,
  logger as slogger,
} from "aloha-shared";

import { AlohaInjector } from "@aloha-injector/injector";
import { AgentRepository } from "@aloha-repositories/agent-repository-interface";
import { PLUGIN_ID } from "./id";
import { ClientWorkflowPluginExtra, IdAndTypeSchema, ItemType } from "./types";

type RepositoryForObjectWithExtras =
  | ConnectionOptionsRepository
  | AgentRepository;

export default class PluginWorkflowClient implements PluginWorkflow {
  type = "workflow" as const;
  version = "1.0.0";
  id = PLUGIN_ID;

  private logger!: () => slogger.Logger;
  private extendedAlohaInjector!: AlohaInjector;
  private runtimeInjector!: PluginRuntimeInjector;

  // eslint-disable-next-line @typescript-eslint/require-await
  async init({ runtimeInjector }: PluginInitContext) {
    if (!isPluginWorkflow(this)) {
      throw new Error("The plugin should have type === 'workflow'");
    }

    this.runtimeInjector = runtimeInjector;

    const getLogger = runtimeInjector.resolve("getLogger");
    const replaceInjector = runtimeInjector.resolve("replaceAlohaInjector");
    const alohaInjector = runtimeInjector.resolve("alohaInjector");

    this.logger = getLogger(this.id.toUpperCase());

    this.extendedAlohaInjector = alohaInjector
      // Connection Options Repository decorators
      .provideFactory(
        "connectionOptionsRepository",
        repositoryWriteDecorate("connectionOptionsRepository", [
          (impl: ConnectionOptionsRepository) =>
            this.decorateRepositoryWrite(impl, runtimeInjector),
        ])
      )
      .provideFactory(
        "connectionOptionsRepository",
        visibilityRepositoryDecorate("connectionOptionsRepository", [
          (impl: ConnectionOptionsRepository) =>
            this.decorateVisibilityInterface(impl, runtimeInjector),
        ])
      )
      // Agent Repository decorators
      .provideFactory(
        "agentRepository",
        repositoryWriteDecorate("agentRepository", [
          (impl: AgentRepository) =>
            this.decorateRepositoryWrite(impl, runtimeInjector),
        ])
      )
      .provideFactory(
        "agentRepository",
        visibilityRepositoryDecorate("agentRepository", [
          (impl: AgentRepository) =>
            this.decorateVisibilityInterface(impl, runtimeInjector),
        ])
      );

    replaceInjector(this.extendedAlohaInjector);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async getRouter() {
    const router = Router();
    router.use(json());
    router.get("/state/:type/:id", async (req, res) => {
      const params = IdAndTypeSchema.safeParse(req.params);

      if (!params.success) {
        res.status(400).json({ error: "Invalid params" }).end();
        return;
      }
      const { id, type } = params.data;

      const getUserInfo = this.runtimeInjector.resolve("getUserInfo");
      const userInfo = await getUserInfo();

      if (!userInfo) {
        res
          .status(401)
          .json({
            error: `Unable to get current user info`,
          })
          .end();
        return;
      }

      const permissionRead =
        type === "client"
          ? authentication_strategy.Permissions.ClientsRead
          : authentication_strategy.Permissions.AgentsRead;

      if (!userInfo.loggedUser.permissions.includes(permissionRead)) {
        res
          .status(403)
          .json({ error: `User not authorized to read the item info` })
          .end();
        return;
      }

      const repository = this.getRepositoryByType(type);

      const item = await repository.findById(id);
      if (!item) {
        res
          .status(404)
          .json({
            error: `Item not found`,
          })
          .end();
        return;
      }

      const extra = getPluginExtraWithDefault(this, item, { state: "DRAFT" });
      res.json({ ...extra }).end();
    });

    router.post("/state/:type/:id", async (req, res) => {
      const params = IdAndTypeSchema.safeParse(req.params);

      if (!params.success) {
        res.status(400).json({ error: "Invalid params" }).end();
        return;
      }
      const { id, type } = params.data;
      const body = req.body as ClientWorkflowPluginExtra;

      if (!body) {
        res.status(400).json({ error: "Wrong body" }).end();
        return;
      }

      const getUserInfo = this.runtimeInjector.resolve("getUserInfo");
      const userInfo = await getUserInfo();

      if (!userInfo) {
        res
          .status(401)
          .json({
            error: `Unable to get current user info`,
          })
          .end();
        return;
      }

      if (
        !userInfo.loggedUser.permissions.includes(
          authentication_strategy.Permissions.ManageWorkflows
        )
      ) {
        res
          .status(403)
          .json({ error: `User not authorized to change the client state` })
          .end();
        return;
      }

      const repository = this.getRepositoryByType(type);

      const item = await repository.findById(id);
      if (!item) {
        res
          .status(404)
          .json({
            error: `Client not found`,
          })
          .end();
        return;
      }

      setPluginExtra(this, item, body);

      try {
        this.logger()
          .child({ id, type, extras: item.extras })
          .debug("Extras to save");

        await repository.updateById(id, {
          extras: item.extras,
        });
        const mcpManager = this.extendedAlohaInjector.resolve("mcpManager");

        await mcpManager.reloadConnection(item);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update client state";
        res.status(400).json({ error: message }).end();
        return;
      }

      res.status(202).end();
    });

    return router;
  }

  private getRepositoryByType(type: ItemType) {
    return type === "client"
      ? this.extendedAlohaInjector.resolve("connectionOptionsRepository")
      : this.extendedAlohaInjector.resolve("agentRepository");
  }

  private decorateVisibilityInterface(
    impl: RepositoryForObjectWithExtras,
    runtimeInjector: PluginRuntimeInjector
  ) {
    const originalCall = impl.setVisibility.bind(impl);

    impl.setVisibility = async (
      id: string,
      visibility: schemas.VisibilityInterface
    ) => {
      const userInfo = await runtimeInjector.resolve("getUserInfo")();
      const log = this.logger().child({ userInfo });

      const itemToCheck = await this.createItemToCheck(impl, id, undefined);

      log
        .child({ extras: itemToCheck.extras })
        .debug("Merged extras from database");

      const itemExtra = getPluginExtraWithDefault(
        this,
        itemToCheck
      ) as ClientWorkflowPluginExtra;

      const itemVisibility =
        visibility.visibility || schemas.Visibility.Private;

      const itemProjects = itemToCheck.projects || [];

      this.checkPermissionToProceed(
        itemExtra,
        itemVisibility,
        itemProjects,
        userInfo,
        log
      );

      return originalCall(id, visibility);
    };

    return impl;
  }

  private decorateRepositoryWrite(
    impl: RepositoryForObjectWithExtras,
    runtimeInjector: PluginRuntimeInjector
  ) {
    this.decorateCreate(impl);
    this.decorateUpdateById(impl, runtimeInjector);
    return impl;
  }

  private decorateCreate(impl: RepositoryForObjectWithExtras) {
    const originalCall = impl.create.bind(impl);
    impl.create = async (item: schemas.ObjectWithExtras) => {
      this.logger().child({ item }).debug("Set default state to draft");

      this.setDefaultPluginExtra(item);

      const res = await originalCall(item);

      return res;
    };
  }

  private setDefaultPluginExtra(item: schemas.ObjectWithExtras) {
    const defaultExtra: ClientWorkflowPluginExtra = {
      state: "DRAFT",
    };

    setPluginExtra(this, item, defaultExtra);

    return true;
  }

  private decorateUpdateById(
    impl: RepositoryForObjectWithExtras,
    runtimeInjector: PluginRuntimeInjector
  ) {
    const originalCall = impl.updateById.bind(impl);

    impl.updateById = async (
      id: string,
      item: schemas.ObjectWithExtras
    ): Promise<boolean> => {
      const userInfo = await runtimeInjector.resolve("getUserInfo")();

      if (!userInfo) {
        return await originalCall(id, item);
      }
      const log = this.logger().child({
        itemId: id,
        userId: userInfo.loggedUser.userId,
      });

      log.debug("Check the state before update");

      const itemToCheck = await this.createItemToCheck(impl, id, item);

      log
        .child({ extras: itemToCheck.extras })
        .debug("Merged extras from database");

      const itemExtra = itemToCheck.extras![
        this.id
      ] as ClientWorkflowPluginExtra;

      const itemVisibility =
        itemToCheck.visibility || schemas.Visibility.Private;

      const itemProjects = itemToCheck.projects || [];

      this.checkPermissionToProceed(
        itemExtra,
        itemVisibility,
        itemProjects,
        userInfo,
        log
      );

      const res = await originalCall(id, item);
      return res;
    };
  }

  private async createItemToCheck(
    impl: RepositoryForObjectWithExtras,
    id: string,
    item: schemas.ObjectWithExtras | undefined
  ) {
    const itemFromDb = await impl.findById(id);

    if (item !== undefined) {
      const extrasFromItemToSave = getPluginExtraWithDefault(this, item, {});
      setPluginExtra(this, itemFromDb, extrasFromItemToSave);
    }
    return itemFromDb;
  }

  private checkPermissionToProceed(
    itemExtra: ClientWorkflowPluginExtra,
    visibility: schemas.Visibility,
    projects: string[],
    userInfo: PluginUserInfo,
    log: slogger.Logger
  ) {
    if (
      itemExtra.state === "DRAFT" &&
      visibility === schemas.Visibility.Managed
    ) {
      const loggedUserProjects = userInfo.loggedUser.projects || [];
      if (projects.find((p) => !loggedUserProjects.includes(p))) {
        log.debug(
          "User specified a project in the client that not belong to its projects"
        );
        throw new Error(
          `Only user projects can be specified when setting visibility to managed`
        );
      }
    }

    if (
      itemExtra.state === "DRAFT" &&
      visibility === schemas.Visibility.Public
    ) {
      log.debug(
        "User tried to set visibility to public but the state of the client is Draft"
      );

      throw new Error(`Draft clients cannot be public`);
    }

    const userPermissions = userInfo.loggedUser.permissions || [];

    if (
      itemExtra.state !== "DRAFT" &&
      !userPermissions.includes(
        authentication_strategy.Permissions.ManageWorkflows
      ) /* disabled for testing  &&
    !userPermissions.includes(
      authentication_strategy.Permissions.Administration
    )*/
    ) {
      log.info(
        "User has no rights to change the state to something different from Draft"
      );

      throw new Error(
        `You don't have the right to set a state that it's not Draft`
      );
    }
  }
}
