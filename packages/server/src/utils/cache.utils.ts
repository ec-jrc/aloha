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

import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { unknownToString } from "./type-utils";

const logger = getLogger("CACHE_UTILS");

export function findCachedUsersById(id: string) {
  const usersCache = injector().resolve("usersCache");
  const usersRepository = injector().resolve("userRepository");
  return usersCache.get(id, async () => {
    try {
      return await usersRepository.findById(id);
    } catch (err) {
      logger()
        .child({ id, error: unknownToString(err) })
        .error("Error while loading user from DB");
      return null;
    }
  });
}
