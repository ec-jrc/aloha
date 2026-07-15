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

import { UIPluginDefinition } from "@/plugins/definitions/ui-slot-plugin";

export async function loadPlatformPlugins() {
  const res = await fetch("/api/plugins/");
  const plugins: string[] = await res.json();

  const loaded: UIPluginDefinition[] = [];
  for (const name of plugins) {
    const module = await import(
      /* @vite-ignore */ `/api/plugins/${name}/browser-plugin.js`
    );
    const instance = new module.default();
    if (instance) {
      loaded.push(instance);
    }
  }

  return loaded;
}
