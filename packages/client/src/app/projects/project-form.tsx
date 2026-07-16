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
  DialogClose,
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useService } from "@/hooks/use-service";
import { exceptionToMessage } from "@/utils/type-utils";
import { DocumentCheckIcon } from "@heroicons/react/16/solid";
import { zodResolver } from "@hookform/resolvers/zod";
import { schemas } from "aloha-shared";
import { ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  createProject,
  getProjectDetail,
  updateProject,
} from "../../services/projects";

const ProjectWithTagsStringSchema = schemas.ProjectSchema.omit({
  tags: true,
}).and(
  z.object({
    tags: z.string(),
  })
);
type ProjectWithTagsString = z.infer<typeof ProjectWithTagsStringSchema>;
type Props = {
  projectId: string | undefined;
  children: ReactNode;
  onAccept: () => Promise<void>;
};
export default function ProjectForm({ projectId, onAccept, children }: Props) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [isLoading, project] = useService(getProjectDetail, [projectId], null, [
    projectId,
    dialogOpen,
  ]);

  const form = useForm({
    resolver: zodResolver(ProjectWithTagsStringSchema),
    values: {
      description: project?.description || "",
      name: project?.name || "",
      projectId: project?.projectId || "",
      tags: project?.tags?.join(", ") || "",
    },
  });

  async function onSubmit(values: ProjectWithTagsString) {
    const projectData = {
      projectId: values.projectId,
      name: values.name,
      description: values.description,
      tags: values.tags
        .split(",")
        .filter((t) => !!t)
        .map((t) => t.trim()),
    };

    const parsedData = schemas.ProjectSchema.parse(projectData);

    try {
      if (projectId) {
        // Update existing project
        await updateProject(projectId, parsedData);
      } else {
        // Create new project
        await createProject(parsedData);
      }
      await onAccept();
    } catch (e) {
      return `Error while saving project: ${exceptionToMessage(e)}`;
    }
  }

  const resetDialog = () => {
    form.reset();
  };
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild onClick={() => resetDialog()}>
        {children}
      </DialogTrigger>
      {dialogOpen && (
        <DialogContent className="!max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>
              {projectId ? "Edit Project" : "New Project"}
              {dialogOpen && isLoading && " - Loading..."}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <ScrollArea className="h-[60vh] border p-4 mb-4 rounded bg-white">
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => {
                    return (
                      <FormItem className="mb-4">
                        <FormLabel>Project ID</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isLoading} />
                        </FormControl>
                        <FormDescription>
                          Identifier to assign to the project
                        </FormDescription>
                        <FormMessage></FormMessage>
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => {
                    return (
                      <FormItem className="mb-4">
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isLoading} />
                        </FormControl>
                        <FormDescription>
                          Name to assign to the project
                        </FormDescription>
                        <FormMessage></FormMessage>
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => {
                    return (
                      <FormItem className="mb-4">
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} disabled={isLoading} />
                        </FormControl>
                        <FormDescription>
                          Description for the project
                        </FormDescription>
                        <FormMessage></FormMessage>
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => {
                    return (
                      <FormItem className="mb-4">
                        <FormLabel>Tags</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isLoading} />
                        </FormControl>
                        <FormDescription>
                          Comma separated list of tags (tag1, tag2, ...)
                        </FormDescription>
                        <FormMessage></FormMessage>
                      </FormItem>
                    );
                  }}
                />
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
        </DialogContent>
      )}
    </Dialog>
  );
}
