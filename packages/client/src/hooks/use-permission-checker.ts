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

import { UserContext } from "@/context/contexes";
import { WithErrors } from "@/services/utils";
import { isDefined } from "@/utils/type-utils";
import { authentication_strategy, schemas } from "aloha-shared";
import { useContext } from "react";

export interface PermissionChecker {
  user(): authentication_strategy.UserPrincipalWithProjects | null;
  has(permission: authentication_strategy.Permissions): boolean;
  isAdministrator(): boolean;
  hasOwnership(
    obj:
      | schemas.VisibilityInterface
      | WithErrors<schemas.VisibilityInterface>
      | null
      | undefined
  ): boolean;
  hasVisibility(obj: schemas.VisibilityInterface | null | undefined): boolean;
  hasPublicVisibility(
    obj: schemas.VisibilityInterface | null | undefined
  ): boolean;
  hasPrivateVisibility(
    obj: schemas.VisibilityInterface | null | undefined
  ): boolean;
}

export function usePermissionChecker(): PermissionChecker {
  const user = useContext(UserContext);

  const has = (permission: authentication_strategy.Permissions) => {
    return isDefined(user) && user.permissions.includes(permission);
  };

  const hasVisibility = (
    obj: schemas.VisibilityInterface | null | undefined,
    visibility: schemas.Visibility
  ) => {
    return isDefined(obj) && obj.visibility === visibility;
  };
  const hasOwnership = (
    obj: schemas.VisibilityInterface | null | undefined
  ) => {
    return isDefined(user) && isDefined(obj) && obj.creator === user.id;
  };
  return {
    user: () => user,
    has: (permission) => has(permission),
    isAdministrator: () =>
      has(authentication_strategy.Permissions.Administration),
    hasOwnership,
    hasVisibility: (obj) => {
      // Administrators have READ access to all objects
      if (has(authentication_strategy.Permissions.Administration)) {
        return true;
      }

      if (hasVisibility(obj, schemas.Visibility.Public)) return true;
      if (hasVisibility(obj, schemas.Visibility.Private) && hasOwnership(obj))
        return true;
      if (
        hasVisibility(obj, schemas.Visibility.Managed) &&
        obj?.projects?.some((p) => user?.projects?.find((up) => up.id === p))
      ) {
        return true;
      }
      return false;
    },
    hasPublicVisibility: (obj) => hasVisibility(obj, schemas.Visibility.Public),
    hasPrivateVisibility: (obj) =>
      hasVisibility(obj, schemas.Visibility.Private),
  };
}
