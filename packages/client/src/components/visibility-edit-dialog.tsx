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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { getProjectsList } from "@/services/projects";
import { VisibilityServiceFunc } from "@/services/utils";
import { exceptionToMessage } from "@/utils/type-utils";
import { Pencil } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { schemas } from "aloha-shared";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Switch } from "./ui/switch";

type Props = {
  name: string;
  visibilityObject: schemas.WithIdBase & schemas.VisibilityInterface;
  editService: VisibilityServiceFunc;
  trigger?: React.ReactNode;
  onAccept?: () => Promise<void>;
};

export default function VisibilityEditDialog({
  name,
  visibilityObject,
  editService,
  trigger,
  onAccept,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const permissionChecker = usePermissionChecker();
  const [projects, setProjects] = useState<schemas.ProjectWithId[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<
    string[] | undefined
  >(undefined);

  useEffect(() => {
    getProjectsList()
      .then((p) => setProjects(p))
      .catch((e) => {
        console.error(e);
        toast.error(
          `Error while fetching clients: ${e && typeof e == "object" && "message" in e ? e.message : e}`
        );
      });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedProjects(visibilityObject.projects);
  }, [visibilityObject]);

  const form = useForm({
    resolver: zodResolver(schemas.VisibilitySchema),
    defaultValues: visibilityObject,
    values: visibilityObject,
  });

  useEffect(() => {
    if (dialogOpen) {
      form.reset();
    }
  }, [form, dialogOpen, visibilityObject]);

  async function onSubmit(values: schemas.VisibilityInterface) {
    try {
      if (visibilityObject.id && editService) {
        await editService(visibilityObject.id, {
          ...values,
          projects:
            values.visibility == schemas.Visibility.Managed
              ? selectedProjects
              : undefined,
        });
      }

      setDialogOpen(false);
      if (onAccept) {
        await onAccept();
      }
    } catch (e: unknown) {
      console.error(e);
      toast.error(exceptionToMessage(e));
    }
  }

  const visibility = useWatch({ control: form.control, name: "visibility" });

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => setDialogOpen(open)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="default"
            className=""
            disabled={
              !(
                permissionChecker.hasOwnership(visibilityObject) ||
                permissionChecker.isAdministrator()
              )
            }
          >
            <Pencil /> Edit Access
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editing Access of {name}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="visibility"
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>Visibility</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select the visibility of this item" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={schemas.Visibility.Private}>
                          Private
                        </SelectItem>
                        <SelectItem value={schemas.Visibility.Public}>
                          Public
                        </SelectItem>
                        <SelectItem value={schemas.Visibility.Managed}>
                          Managed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value == schemas.Visibility.Private
                        ? "Only you can see and use this item"
                        : field.value == schemas.Visibility.Public
                          ? "Everyone can see and use this item, only you can change it"
                          : "Only users in selected projects can see and use this item, only you can change it"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {visibility === schemas.Visibility.Managed && (
              <FormField
                control={form.control}
                name="projects"
                render={() => (
                  <FormItem>
                    <FormLabel>Projects (comma-separated)</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={projects.map((p) => ({
                          label: p.name,
                          value: p.id,
                        }))}
                        onValueChange={(value) => setSelectedProjects(value)}
                        defaultValue={selectedProjects}
                        animation={0}
                        maxCount={3}
                        asChild
                      />
                    </FormControl>
                    <FormDescription>
                      The project authorised to view this item.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="disabled"
              render={({ field }) => {
                return (
                  <FormItem className="flex flex-row items-center justify-start rounded-lg border p-3 shadow-sm">
                    <FormControl>
                      <Switch
                        checked={!field.value}
                        onCheckedChange={(e) => field.onChange(!e)}
                      ></Switch>
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel>Enabled</FormLabel>
                      <FormDescription>
                        {field.value === true
                          ? "This item is disabled and cannot be used"
                          : "This item is enabled"}
                      </FormDescription>
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <DialogFooter className="justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                data-testid="visibility-edit-submit-button-witness"
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Saving..." : "Edit visibility"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
