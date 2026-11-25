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

import express from "express";
import { getLogger } from "../injector/provide-logger";
import { injector } from "../injector/injector";
import { createProxyMiddleware } from "http-proxy-middleware";
import { authorise } from "../middleware/authorise";

const agentRepository = () => injector().resolve("testbedAgentRepository");
const metricsProvider = () => injector().resolve("metricsProvider");
const logger = getLogger("TESTBED-AGENT");

export function testbedAgentProxyRoutes() {
  logger().debug("Registering testbed agent proxy router");

  const router = express.Router();
  const findAgent = async (req: express.Request) => {
    const { id } = req.params;
    const log = logger().child({ agentId: id });
    if (!id) {
      throw Error("Testbed Agent ID not provided");
    }
    log.debug("Proxy request");
    const agent = await agentRepository().findById(id);
    if (!agent) {
      throw new Error("Testbed Agent not found");
    }
    return agent;
  };
  const resolveTarget = async (req: express.Request) => {
    const agent = await findAgent(req);
    return agent.client.baseURL;
  };
  //
  const proxyMiddleware = createProxyMiddleware({
    changeOrigin: true,
    secure: false,
    logger: console,
    pathRewrite: (path) => {
      logger().child({ path }).debug("Proxying path");
      return path;
    },
    router: resolveTarget,
    on: {
      proxyRes: (proxyRes, req) => {
        // Track testbed executions for chat completion requests
        if (req.url?.includes("/chat/completions")) {
          const agentId = req.params?.id || "unknown";
          const success = proxyRes.statusCode !== undefined && proxyRes.statusCode < 400;
          metricsProvider().testbedExecution(agentId, success);
        }
      },
      error: (_err, req) => {
        // Track failed executions
        if (req.url?.includes("/chat/completions")) {
          const agentId = req.params?.id || "unknown";
          metricsProvider().testbedExecution(agentId, false);
        }
      },
    },
  });

  router.get("/:id/models", authorise([]), async (req, res) => {
    const agent = await findAgent(req);
    if (agent.creator !== req.session.user!.id) {
      res.status(405).end();
      return;
    }
    // console.log(agent.baseURL + "/models");
    const url = agent.client.baseURL.endsWith("/")
      ? agent.client.baseURL + "models"
      : agent.client.baseURL + "/models";
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agent.client.apiKey}`,
      },
    });
    const data = (await response.json()) as unknown;
    res.json(data);
  });
  router.use("/:id", proxyMiddleware);

  return router;
}
