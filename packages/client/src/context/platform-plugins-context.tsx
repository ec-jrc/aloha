import { UiPluginsContext } from "@/plugins/definitions/ui-slot";
import { UIPluginDefinition } from "@/plugins/definitions/ui-slot-plugin";
import { loadPlatformPlugins } from "@/services/plugins";
import { useEffect, useState } from "react";

export default function PlatformPluginsContextProvider({
  children,
}: React.PropsWithChildren) {
  const [loadedPlugins, setLoadedPlugins] = useState<UIPluginDefinition[]>([]);

  useEffect(() => {
    async function loadAllPlatformPlugins() {
      const plugins = await loadPlatformPlugins();
      setLoadedPlugins(plugins);
    }

    loadAllPlatformPlugins();
  }, []);

  return (
    <UiPluginsContext.Provider value={loadedPlugins}>
      {children}
    </UiPluginsContext.Provider>
  );
}
