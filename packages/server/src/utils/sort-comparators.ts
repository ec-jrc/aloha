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

import { schemas } from "aloha-shared";

export function stringComparer<T>(key: keyof T) {
  return (a: T, b: T) => {
    const ak = a[key] as string;
    const bk = b[key] as string;
    return ak < bk ? -1 : ak === bk ? 0 : 1;
  };
}

export function compositeComparer<T>(
  ...comparers: Array<(a: T, b: T) => number>
) {
  return (a: T, b: T) => {
    for (const comparer of comparers) {
      const result = comparer(a, b);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  };
}

export function versionNumberComparer<
  T extends { versioningInfo?: schemas.VersioningInfo },
>(a: T, b: T) {
  if (a.versioningInfo && b.versioningInfo) {
    if (
      a.versioningInfo.versionGroupingUUID ===
      b.versioningInfo.versionGroupingUUID
    ) {
      return a.versioningInfo.versionNumber - b.versioningInfo.versionNumber;
    }
  }
  return 0;
}
