import express from "express";
import path from "path";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { promisify } from "util";
import { exists } from "fs";

const existsPromise = promisify(exists);

export async function pluginsRoutes() {
  const router = express.Router();
  const logger = getLogger("PLUGINS");
  const pluginNames = injector().resolve("platformPluginsNames");
  const pluginsDir = injector().resolve("platformPluginsPath");
  const plugins = await injector().resolve("platformPlugins");

  logger().info(
    { pluginsDirectoryNames: pluginNames, pluginsDir },
    "Registering platform plugins"
  );

  if (!pluginsDir) {
    logger().info(
      "No platformPluginsPath specified. There is nothing to serve"
    );
    return router;
  }

  router.get("/", (_req, res) => {
    res.json(pluginNames);
  });

  router.get("/:name/browser-plugin.js", async (req, res) => {
    const name = req.params.name;
    if (!pluginNames.includes(name)) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }
    const pluginPath = path.join(pluginsDir, name, "lib", "browser-plugin.js");
    if (!(await existsPromise(pluginPath))) {
      res
        .status(500)
        .json({
          error: "Plugin implementation doesn't exists",
        })
        .end();
      return;
    }
    res.sendFile(pluginPath);
  });

  const seenIds = new Set<string>();
  for (const p of plugins) {
    if (seenIds.has(p.id)) {
      throw new Error(`Duplicate plugin id: ${p.id}`);
    }
    seenIds.add(p.id);
  }

  await Promise.all(
    plugins.map(async (p) => {
      const id = p.id;
      logger().debug({ pluginId: id }, "Registering plugin routes");
      const pluginRouter = await p.getRouter();
      if (pluginRouter) {
        router.use(`/${id}/routes`, pluginRouter);
      }
    })
  );

  return router;
}
