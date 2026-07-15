import { Injector } from "typed-inject";
import { PluginBase } from "../plugins/definitions/plugins-types";
import { loadServerPlugins } from "../plugins/plugins-setup";
import fs from "fs";

export function providePlatformPlugins<
  T extends {
    platformPluginsNames: string[];
    platformPluginsPath: string | undefined;
  },
>(injector: Injector<T>) {
  const pluginNames = injector.resolve("platformPluginsNames");
  const pluginsDir = injector.resolve("platformPluginsPath");
  if (pluginsDir) {
    const pluginsDirExists = fs.existsSync(pluginsDir);
    if (!pluginsDirExists) {
      throw new Error(`Plugin ${pluginsDir} doesn't exists`);
    }
  }
  const loadedPlugins: Promise<PluginBase[]> = loadServerPlugins(
    pluginsDir,
    pluginNames
  );

  return injector.provideValue("platformPlugins", loadedPlugins);
}
