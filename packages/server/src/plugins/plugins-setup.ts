import { authentication_strategy } from "aloha-shared";
import path from "path";
import { createInjector } from "typed-inject";
import { injector, replaceInjector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { requestContext } from "../middleware/request-context";
import { findCachedUsersById } from "../utils/cache.utils";
import {
  PluginBase,
  PluginRuntimeInjector,
  PluginUserInfo,
} from "./definitions/plugins-types";

export async function loadServerPlugins(
  pluginsDir: string | undefined,
  pluginNames: string[]
): Promise<PluginBase[]> {
  if (!pluginsDir) {
    return [];
  }

  const plugins = await Promise.all(
    pluginNames.map(async (name) => {
      const pluginPath = path.join(pluginsDir, name, "lib", "server-plugin.js");
      const mod = (await import(pluginPath)) as {
        default: new () => PluginBase;
      };
      const instance = new mod.default();
      return instance;
    })
  );

  return plugins;
}

export async function initPlatformPlugins() {
  const alohaInjector = injector();
  const logger = getLogger("INIT-PLATFORM-PLUGINS");
  const pluginsLoaded = await alohaInjector.resolve("platformPlugins");
  const runtimeInjector: PluginRuntimeInjector = createInjector()
    .provideValue("getLogger", getLogger)
    .provideValue("alohaInjector", alohaInjector)
    .provideValue("replaceAlohaInjector", replaceInjector)
    .provideValue("getUserInfo", async () => {
      const req = requestContext.getStore();
      if (req && authentication_strategy.isUserAuthenticated(req)) {
        const user = authentication_strategy.getUserFromSession(req);
        const loggedUser = await findCachedUsersById(user.id);

        if (!loggedUser) {
          return undefined;
        }

        const userInfo: PluginUserInfo = {
          loggedUser,
          principal: user,
        };

        return userInfo;
      }
      return undefined;
    });

  for (const plugin of pluginsLoaded) {
    logger().child({ plugin }).info("Init plugin");
    await plugin.init({ runtimeInjector });
  }
}
