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

import ConfirmDialog from "@/components/confirm-dialog";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import SearchBox from "@/components/search-box";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { useService } from "@/hooks/use-service";
import { camelCaseToSpaces } from "@/utils/string-utils";
import { isDefined } from "@/utils/type-utils";
import { DocumentPlusIcon, TrashIcon } from "@heroicons/react/16/solid";
import { authentication_strategy, schemas } from "aloha-shared";
import { Pencil } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { getProjectsList } from "../../services/projects";
import { deleteUser, getUsersList } from "../../services/users";
import UserForm from "./user-form";

const ALL_PERMISSION_ENTRIES = Object.entries(
  authentication_strategy.Permissions
).filter(([, value]) => typeof value === "string");

const userPredicate = (u: schemas.UserWithId, search: string) => {
  return search
    .toLowerCase()
    .split(" ")
    .some(
      (f) =>
        u.fullName.toLowerCase().includes(f) ||
        u.userId.toLowerCase().includes(f) ||
        u.projects?.some((p) => p.toLowerCase().includes(f)) ||
        u.permissions.some((p) => p.toLowerCase().includes(f))
    );
};

function DeleteButton({
  userId,
  canManageUsers,
  onDeleted,
}: {
  userId: string;
  canManageUsers: boolean;
  onDeleted: () => void;
}) {
  return (
    <ConfirmDialog
      onClick={async () => {
        try {
          await deleteUser(userId);
          onDeleted();
        } catch (error) {
          console.error(error);
          toast.error("There was an error while deleting the user");
        }
      }}
    >
      <Button
        variant="destructive"
        size="icon"
        disabled={!canManageUsers}
        data-testid="delete-user-button-witness"
      >
        <TrashIcon />
      </Button>
    </ConfirmDialog>
  );
}

function EditButton({
  userId,
  canManageUsers,
  onEdited,
}: {
  userId: string;
  canManageUsers: boolean;
  onEdited: () => Promise<void>;
}) {
  return (
    <UserForm userId={userId} onAccept={onEdited}>
      <Button
        className="mr-2"
        size="icon"
        disabled={!canManageUsers}
        data-testid="edit-user-button-witness"
      >
        <Pencil />
      </Button>
    </UserForm>
  );
}

function NewButton({
  canManageUsers,
  onCreated,
}: {
  canManageUsers: boolean;
  onCreated: () => Promise<void>;
}) {
  return (
    <UserForm userId={undefined} onAccept={onCreated}>
      <Button
        variant="default"
        disabled={!canManageUsers}
        data-testid="new-user-button-witness"
      >
        <DocumentPlusIcon />
        New User
      </Button>
    </UserForm>
  );
}

export default function UsersListPage() {
  const [filteredUsers, setFilteredUsers] = useState<
    schemas.UserWithId[] | null
  >(null);
  const [requestRefresh, setRequestRefresh] = useState(1);

  const [isLoading, users] = useService(
    async () => {
      const [projects, usersList] = await Promise.all([
        getProjectsList(),
        getUsersList(),
      ]);
      return usersList.map((u) => ({
        ...u,
        projects: u.projects?.map(
          (up) => projects.find((pr) => pr.id == up)?.name ?? up
        ),
      }));
    },
    [],
    [],
    [requestRefresh]
  );

  const permissionChecker = usePermissionChecker();

  const canManageUsers = useMemo(() => {
    return (
      permissionChecker.isAdministrator() ||
      permissionChecker.has(authentication_strategy.Permissions.UsersWrite)
    );
  }, [permissionChecker]);

  const refreshList = useCallback(() => {
    setRequestRefresh((r) => r + 1);
  }, []);

  const displayedUsers = filteredUsers ?? users;

  return (
    <div className="max-w-8xl mx-auto" data-testid="user-list-page-witness">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <PageTitle className="text-2xl font-bold text-gray-900">
            Users
          </PageTitle>
          <NewButton
            canManageUsers={canManageUsers}
            onCreated={async () => refreshList()}
          />
        </div>

        {/* Search and Filter */}
        <SearchBox
          items={users}
          predicate={userPredicate}
          onFilter={setFilteredUsers}
          placeholder="Search users by name, ID, projects, or permissions..."
        />
      </div>
      <div className="flex flex-wrap gap-8">
        <Table className="w-full">
          <TableCaption>Users list</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/12">User ID</TableHead>
              <TableHead className="w-1/6">Fullname</TableHead>
              <TableHead className="w-1/5">Projects</TableHead>
              <TableHead className="w-auto">Permissions</TableHead>
              <TableHead className="text-center w-1/12">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {users.length > 0 &&
              displayedUsers.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell data-testid="user-id-witness" className="w-1/12">
                    {user.userId}
                  </TableCell>
                  <TableCell className="whitespace-break-spaces w-1/6">
                    {user.fullName}
                    {user.disabled && (
                      <span className="text-red-600"> disabled</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-break-spaces w-1/5">
                    {user.projects?.join(", ")}
                  </TableCell>
                  <TableCell className="whitespace-break-spaces w-auto">
                    {user.permissions
                      .map((e) =>
                        ALL_PERMISSION_ENTRIES.find((v) => v[1] === e)
                      )
                      .filter(isDefined)
                      .map((e) => camelCaseToSpaces(e[0]))
                      .join(", ")}
                  </TableCell>
                  <TableCell className="text-center w-1/12">
                    <EditButton
                      userId={user.id}
                      canManageUsers={canManageUsers}
                      onEdited={async () => refreshList()}
                    />
                    <DeleteButton
                      userId={user.id}
                      canManageUsers={canManageUsers}
                      onDeleted={refreshList}
                    />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
