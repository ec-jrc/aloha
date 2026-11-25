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

import { authentication_strategy, schemas } from "aloha-shared";
import express, { Request, Response, Router } from "express";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { findCachedUsersById } from "../utils/cache.utils";
import z from "zod";
import { validateRequestBody } from "./utils";

const userRepository = () => injector().resolve("userRepository");
const usersCache = () => injector().resolve("usersCache");
const projectRepository = () => injector().resolve("projectRepository");
const logger = getLogger("USER-INFO");

export function userInfoRouter() {
  const router: Router = express.Router();

  logger().debug("Registering user info router");

  router.use(express.json());
  router.post(
    "/updateCurrentUserInfo",
    validateRequestBody(z.object({ fullName: z.string() }), logger),
    async (req, res) => {
      if (authentication_strategy.isUserAuthenticated(req)) {
        const principal = authentication_strategy.getUserFromSession(req);
        const data = req.body as { fullName: string };
        const userId = principal.id;
        const dbUser = await userRepository().findById(userId);
        if (!dbUser) {
          return res.status(404).json({ error: "User not found" }).end();
        }

        const success = await userRepository().updateById(dbUser.id, data);
        if (success) {
          usersCache().del(dbUser.id);
          return res.status(200).end();
        } else {
          return res.status(500).json({ error: "Unable to update user" });
        }
      }
      return res.status(401).json({ error: "User not authorized" }).end();
    }
  );
  // Get information of the connected user
  router.get("/", async (req: Request, res: Response) => {
    if (authentication_strategy.isUserAuthenticated(req)) {
      const userSession = authentication_strategy.getUserFromSession(req);
      let user: schemas.UserWithId | null;
      try {
        user = await findCachedUsersById(userSession.id);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        return res.status(204).end();
      }
      let projects: { id: string; name: string }[] = [];
      if (user && user.projects) {
        projects = await Promise.all(
          user.projects.map(async (projectId) => {
            const project = await projectRepository().findById(projectId);
            return {
              id: projectId,
              name: project?.name || "Unknown",
            };
          })
        );
      }
      res.json({
        ...userSession,
        displayName: user?.fullName || userSession.displayName,
        projects,
      });
    } else {
      res.status(204).end();
    }
  });

  return router;
}
