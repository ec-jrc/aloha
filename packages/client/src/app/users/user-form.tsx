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

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DocumentCheckIcon } from "@heroicons/react/16/solid";
import { zodResolver } from "@hookform/resolvers/zod";
import { authentication_strategy, schemas } from "aloha-shared";
import { ReactNode, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { getProjectsList } from "../../services/projects";
import {
  createUser,
  getUserDetail,
  updateCurrentUserInfo,
  updateUser,
} from "../../services/users";
import { exceptionToMessage } from "../../utils/type-utils";
import { MultiSelect } from "@/components/ui/multi-select";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useService } from "@/hooks/useService";
import { camelCaseToSpaces } from "@/utils/string-utils";

const ALL_PERMISSION_ENTRIES = Object.entries(
  authentication_strategy.Permissions
).filter(([, value]) => typeof value === "string");

type Props = {
  children: ReactNode;
  userId: string | undefined;
  onAccept: () => Promise<void>;
  updateCurrentUser?: boolean;
};

export default function UserForm({
  userId,
  children,
  onAccept,
  updateCurrentUser,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  const [isLoadingUser, user] = useService(
    async (userId) => {
      const userData = await getUserDetail(userId);
      if (userData) {
        userData.projects = userData.projects || [];
        userData.permissions = userData.permissions || [];
      }
      return userData;
    },
    [userId],
    {
      fullName: "",
      id: "",
      userId: "",
      disabled: false,
      projects: [],
      permissions: [],
    },
    [userId, dialogOpen]
  );

  const [isLoadingProjects, projects] = useService(
    getProjectsList,
    [],
    [],
    [dialogOpen]
  );

  const isLoading = useMemo(
    () => isLoadingUser || isLoadingProjects,
    [isLoadingUser, isLoadingProjects]
  );
  const form = useForm<schemas.User>({
    resolver: zodResolver(schemas.UserSchema),
    values: isLoading
      ? {
          fullName: "",
          permissions: [],
          userId: "",
          projects: [],
        }
      : user || undefined,
  });

  async function onSubmit(values: schemas.User) {
    values = {
      ...values,
      projects: user?.projects || [],
      permissions: user?.permissions || [],
    };

    try {
      if (updateCurrentUser) {
        await updateCurrentUserInfo({ fullName: values.fullName });
      } else if (userId && userId.length > 0) {
        // Update existing user
        await updateUser(userId, values);
      } else {
        // Create new user
        await createUser(values);
      }
      setDialogOpen(false);
      await onAccept();
    } catch (e) {
      toast.error(`Error while fetching user: ${exceptionToMessage(e)}`);
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild onClick={() => form.reset()}>
        {children}
      </DialogTrigger>
      {dialogOpen && !isLoading && (
        <DialogContent className="!max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>{userId ? "Edit User" : "New User"}</DialogTitle>
          </DialogHeader>

          {!user ? (
            <div className="font-bold text-red-700">
              Could not retrieve the user
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <ScrollArea className="h-[60vh]  border p-4 mb-4 rounded bg-white">
                  <div className="flex flex-row items-center mb-4">
                    <FormField
                      control={form.control}
                      name="userId"
                      render={({ field }) => {
                        return (
                          <FormItem className="w-1/2 mr-2">
                            <FormLabel>User ID</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                disabled={isLoading || updateCurrentUser}
                              />
                            </FormControl>
                            <FormDescription>
                              User ID of the user according to the
                              authentication strategy
                            </FormDescription>
                            <FormMessage></FormMessage>
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => {
                        return (
                          <FormItem className="w-1/2">
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input {...field} disabled={isLoading} />
                            </FormControl>
                            <FormDescription>
                              Full name of the user
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="permissions"
                    render={() => {
                      return (
                        <FormItem className="mb-4">
                          <FormLabel>Permissions</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={ALL_PERMISSION_ENTRIES.map(
                                (
                                  [key, value] // Filter out numeric keys
                                ) => ({ label: camelCaseToSpaces(key), value })
                              )}
                              animation={0}
                              maxCount={updateCurrentUser ? 99 : 3}
                              asChild
                              onValueChange={(value) => {
                                if (user) user.permissions = value;
                              }}
                              defaultValue={user?.permissions}
                              disabled={updateCurrentUser}
                            />
                          </FormControl>
                          <FormDescription>
                            Permissions granted to the user
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <FormField
                    control={form.control}
                    name="projects"
                    render={() => {
                      return (
                        <FormItem className="mb-4">
                          <FormLabel>Projects</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={projects?.map((p) => ({
                                label: p.name,
                                value: p.id,
                              }))}
                              animation={0}
                              maxCount={updateCurrentUser ? 99 : 3}
                              asChild
                              onValueChange={(value) => {
                                if (user) user.projects = value;
                              }}
                              defaultValue={user?.projects}
                              disabled={updateCurrentUser}
                            />
                          </FormControl>
                          <FormDescription>
                            Projects the user has access to
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  {!updateCurrentUser && (
                    <FormField
                      control={form.control}
                      name="disabled"
                      render={({ field }) => {
                        return (
                          <FormItem className="flex flex-row items-center justify-start rounded-lg border p-3 shadow-sm">
                            <FormControl>
                              <Switch
                                disabled={isLoading}
                                className="mr-1"
                                checked={!field.value}
                                onCheckedChange={(e) => field.onChange(!e)}
                              ></Switch>
                            </FormControl>
                            <div className="space-y-0.5">
                              <FormLabel>Enabled</FormLabel>
                              <FormDescription>
                                Disable or enable the user
                              </FormDescription>
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  )}
                </ScrollArea>
                <DialogFooter className="justify-end">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting || isLoading}
                  >
                    <DocumentCheckIcon />
                    {form.formState.isSubmitting ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      )}
      {dialogOpen && isLoading && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {userId ? "Edit User" : "New User"}
              {dialogOpen && isLoading && " - Loading..."}
            </DialogTitle>
          </DialogHeader>
        </DialogContent>
      )}
    </Dialog>
  );
}
