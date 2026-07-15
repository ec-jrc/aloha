import { UiPluginsContext } from "@/plugins/definitions/ui-slot";
import { useContext, useMemo } from "react";

export function usePlatformPluginsForSlotId(slotId: string) {
  const loadedPlugins = useContext(UiPluginsContext);
  return useMemo(
    () =>
      loadedPlugins.filter((p) => {
        if (p.getUiSlotChanges) {
          const changes = p.getUiSlotChanges(null);
          if (changes[slotId]) {
            return true;
          }
        }
        return false;
      }),
    [slotId, loadedPlugins]
  );
}
