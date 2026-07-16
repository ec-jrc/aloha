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
import * as express from "express";
import { getLogger } from "../injector/provide-logger";
import { A2AServer } from "../connections/a2a-server";
import { getServer } from "./servers-proxy-utils";
import { createOptionalMCPOidcAuthMiddleware } from "../middleware/oidc/oidc-support";
import { getUserWithIdFromRepository } from "./utils";
import { authorise } from "../middleware/authorise";
import { authentication_strategy } from "aloha-shared";

const logger = getLogger("SERVERS-PROXY-A2A");

export function serverProxyA2ARoutes() {
  const router = express.Router();

  const optionalOIDCMiddleware = createOptionalMCPOidcAuthMiddleware(
    "SERVERS-PROXY-A2A",
    getUserWithIdFromRepository
  );

  router.get(
    "/:path/registry/v1",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res) => {
      const server = await getServer(undefined, req, res, A2AServer);
      if (server) {
        return server.registry(req, res);
      } else {
        logger()
          .child({ path: req.params.path })
          .error("Unable to find A2A server");
        return res.status(404).json({
          error: "Unable to find the A2A server",
        });
      }
    }
  );

  router.use(
    "/:path",
    optionalOIDCMiddleware,
    authorise([authentication_strategy.Permissions.ProxyApiAccess]),
    async (req, res, next) => {
      const server = await getServer(undefined, req, res, A2AServer);
      if (server) {
        return server.router(req, res, next);
      } else {
        logger()
          .child({ path: req.params.path })
          .error("Unable to find A2A server");
        return res.status(404).json({
          error: "Unable to find the A2A server",
        });
      }
    }
  );
  return router;
}
