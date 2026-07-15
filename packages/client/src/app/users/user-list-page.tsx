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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useService } from "@/hooks/useService";
import {
  DocumentPlusIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";
import { Pencil } from "lucide-react";
import { authentication_strategy, schemas } from "aloha-shared";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { getProjectsList } from "../../services/projects";
import { deleteUser, getUsersList } from "../../services/users";
import UserForm from "./user-form";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { camelCaseToSpaces } from "@/utils/string-utils";
import { isDefined } from "@/utils/type-utils";

const ROWS_PER_PAGE = 25;

const ALL_PERMISSION_ENTRIES = Object.entries(
  authentication_strategy.Permissions
).filter(([, value]) => typeof value === "string");

export default function UsersListPage() {
  const [filter, setFilter] = useState<string>("");
  const [page, setPage] = useState<number>(1);
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

  const filterUsers = useCallback(
    (u: schemas.User) => {
      if (filter.length < 3) return true;
      return filter
        .toLowerCase()
        .split(" ")
        .map(
          (f) =>
            u.fullName.toLowerCase().includes(f) ||
            u.userId.toLowerCase().includes(f) ||
            u.projects?.some((p) => p.toLowerCase().includes(f)) ||
            u.permissions.some((p) => p.toLowerCase().includes(f))
        )
        .some((f) => f);
    },
    [filter]
  );

  const DeleteButton = ({ userId }: { userId: string }) => {
    return (
      <ConfirmDialog
        onClick={async () => {
          try {
            await deleteUser(userId);
            setRequestRefresh(requestRefresh + 1);
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
  };

  const EditButton = ({ userId }: { userId: string }) => {
    return (
      <UserForm
        userId={userId}
        onAccept={async () => setRequestRefresh(requestRefresh + 1)}
      >
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
  };

  const NewButton = () => {
    return (
      <UserForm
        userId={undefined}
        onAccept={async () => setRequestRefresh(requestRefresh + 1)}
      >
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
  };

  const handleChangePage = (
    _event: React.MouseEvent<HTMLButtonElement>,
    newPage: number
  ) => {
    setPage(newPage);
  };

  // const handleChangeRowsPerPage = (
  //   event: React.ChangeEvent<HTMLInputElement>
  // ) => {
  //   setRowsPerPage(parseInt(event.target.value, 10));
  //   setPage(1);
  // };

  return (
    <div className="max-w-8xl mx-auto" data-testid="user-list-page-witness">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <PageTitle className="text-2xl font-bold text-gray-900">
            Users
          </PageTitle>
          <NewButton />
        </div>

        {/* Search and Filter */}
        <Input
          type="search"
          className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Search users by name, ID, projects, or permissions..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
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
            {users
              .filter(filterUsers)
              .slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)
              .map((user) => (
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
                    <EditButton userId={user.id}></EditButton>
                    <DeleteButton userId={user.id}></DeleteButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      {users.filter(filterUsers).length > ROWS_PER_PAGE && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={(event) => handleChangePage(event, page - 1)}
            className="mr-2"
            disabled={page === 1}
          >
            Previous
          </Button>
          <Button
            onClick={(event) => handleChangePage(event, page + 1)}
            disabled={page * ROWS_PER_PAGE >= users.filter(filterUsers).length}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
