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

import { getUserDetail } from "@/services/users";
import {
  CreatorServiceFunc,
  VisibilityServiceFunc,
  WithErrors,
} from "@/services/utils";
import { authentication_strategy, schemas } from "aloha-shared";
import { useContext, useEffect, useMemo, useState } from "react";
import { CreatorEditDialog } from "./creator-edit-dialog";
import VisibilityEditDialog from "./visibility-edit-dialog";
import { UserContext } from "@/context/contexes";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
// import { Badge } from "./ui/badge";
import { UserIcon, EyeIcon } from "@heroicons/react/16/solid";
import { Pencil } from "lucide-react";
import { getProjectsList } from "@/services/projects";
import { isDefined } from "@/utils/type-utils";

type Props = {
  item: (
    | schemas.VisibilityInterface
    | WithErrors<schemas.VisibilityInterface>
  ) &
    schemas.WithIdBase;
  name: string;
  setCreatorService: CreatorServiceFunc;
  setVisibilityService: VisibilityServiceFunc;
  onAccept?: () => Promise<void>;
};

function capitalize(v: schemas.Visibility | undefined) {
  if (!v) {
    return "";
  }
  return v.substring(0, 1).toUpperCase() + v.substring(1);
}

// function getVisibilityColor(visibility: schemas.Visibility | undefined) {
//   switch (visibility) {
//     case schemas.Visibility.Public:
//       return "bg-green-100 text-green-800 border-green-200";
//     case schemas.Visibility.Private:
//       return "bg-red-100 text-red-800 border-red-200";
//     case schemas.Visibility.Managed:
//       return "bg-blue-100 text-blue-800 border-blue-200";
//     default:
//       return "bg-gray-100 text-gray-800 border-gray-200";
//   }
// }

export function CreatorAndVisibilityEditor({
  item,
  name,
  setCreatorService,
  setVisibilityService,
  onAccept,
}: Props) {
  const [projects, setProjects] = useState<schemas.ProjectWithId[]>([]);

  const permissionCheker = usePermissionChecker();
  const loggedUser = useContext(UserContext);
  const [creatorUser, setCreatorUser] = useState<schemas.UserWithId | null>(
    null
  );

  const canSeePermissionBox = useMemo(() => {
    return (
      item &&
      (permissionCheker.isAdministrator() ||
        permissionCheker.hasOwnership(item))
    );
  }, [item, permissionCheker]);

  useEffect(() => {
    const fetchUser = async () => {
      if (item.creator && canSeePermissionBox) {
        if (item.creator === loggedUser?.id) {
          setCreatorUser({
            id: loggedUser.id,
            userId: loggedUser.userId,
            fullName: loggedUser.displayName,
            permissions: loggedUser.permissions,
            projects: loggedUser.projects.map((p) => p.id),
          });
        } else {
          const user = await getUserDetail(item.creator);
          setCreatorUser(user);
        }
      }
    };

    fetchUser();
  }, [canSeePermissionBox, item, item.creator, loggedUser]);

  const canEditCreator = useMemo(() => {
    return loggedUser?.permissions.includes(
      authentication_strategy.Permissions.Administration
    );
  }, [loggedUser?.permissions]);

  const canEditVisibility = useMemo(() => {
    return (
      !("isError" in item) &&
      item.creator === loggedUser?.id &&
      setVisibilityService
    );
  }, [item, loggedUser?.id, setVisibilityService]);

  useEffect(() => {
    getProjectsList().then((projects) => {
      const itemProjects = (item.projects || [])
        .map((e) => projects.find((p) => p.id === e))
        .filter((e) => isDefined(e));

      setProjects(itemProjects);
    });
  }, [item, item.projects]);

  if (!canSeePermissionBox) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Ownership & Access
        </h3>
      </div>

      <div className="space-y-4">
        {/* Owner Section */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
              <UserIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Owner
              </dt>
              <dd className="text-sm font-medium text-gray-900">
                {creatorUser?.fullName ??
                  (permissionCheker.isAdministrator() ? (
                    <span className="text-red-600 font-semibold">
                      Unknown user
                    </span>
                  ) : (
                    <span className="text-gray-500 italic">Another user</span>
                  ))}
              </dd>
            </div>
          </div>
          {canEditCreator && (
            <CreatorEditDialog
              name={name}
              objectId={item.id}
              currentCreatorId={item.creator}
              setCreatorService={setCreatorService}
              onAccept={onAccept}
              trigger={
                <button
                  data-testid="edit-owner-button-witness"
                  className="flex items-center gap-1 px-2 py-2 text-xs font-medium bg-blue-100 rounded-md transition-colors duration-150"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              }
            />
          )}
        </div>

        {/* Visibility Section */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
              <EyeIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex items-center gap-2">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Access
                </dt>
                <dd className="text-sm font-medium text-gray-900">
                  {item.disabled ? (
                    <span
                      className="text-red-600"
                      data-testid="visibility-disabled-witness"
                    >
                      Disabled
                    </span>
                  ) : (
                    <span
                      className="text-green-600"
                      data-testid="visibility-disabled-witness"
                    >
                      Enabled
                    </span>
                  )}
                  ,{" "}
                  {item.visibility !== schemas.Visibility.Managed &&
                    capitalize(item.visibility)}
                  {item.visibility === schemas.Visibility.Managed &&
                    projects &&
                    projects.map((e) => e.name).join(", ")}
                </dd>
              </div>
            </div>
          </div>
          {canEditVisibility && (
            <VisibilityEditDialog
              name={name}
              editService={setVisibilityService}
              visibilityObject={{
                id: item.id,
                creator: item?.creator || "",
                visibility: item.visibility || schemas.Visibility.Private,
                projects: item.projects,
                disabled: item.disabled,
              }}
              onAccept={onAccept}
              trigger={
                <button
                  data-testid="visibility-edit-button-witness"
                  className="flex items-center gap-1 px-2 py-2 text-xs font-medium bg-blue-100 rounded-md transition-colors duration-150"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              }
            />
          )}
        </div>

        {/* Additional Info */}
        {/*item.projects && item.projects.length > 0 && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <dt className="text-xs font-medium text-blue-700 uppercase tracking-wide">
                Associated Projects
              </dt>
            </div>
            <dd className="flex flex-wrap gap-1">
              {item.projects.map((projectId) => (
                <Badge
                  key={projectId}
                  className="bg-blue-100 text-blue-800 border-blue-300 text-xs"
                >
                  Project {projectId}
                </Badge>
              ))}
            </dd>
          </div>
        )*/}
      </div>
    </div>
  );
}
