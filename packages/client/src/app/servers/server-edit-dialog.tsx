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
import { endpoints_schemas, schemas } from "aloha-shared";
import { z } from "zod";

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
import {
  createServer,
  getServerDetail,
  updateServer,
} from "@/services/servers";
import { exceptionToMessage } from "@/utils/type-utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
// import { isWithErrorsObject } from "@/services/utils";

const MCPServerOptionsWithTagStringSchema =
  endpoints_schemas.MCPServerOptionsCreateSchema.omit({ tags: true }).and(
    z.object({
      tags: z.string(),
    })
  );
type MCPServerOptionsWithTagString = z.infer<
  typeof MCPServerOptionsWithTagStringSchema
>;

type Props = {
  serverId: string | undefined;
  trigger?: React.ReactNode;
  onAccept?: () => Promise<void>;
};

export default function MCPServerEditDialog({
  serverId,
  trigger,
  onAccept,
}: Props) {
  const [server, setServer] = useState<MCPServerOptionsWithTagString>({
    name: "",
    serverPath: "",
    description: "",
    tags: "",
    visibility: schemas.Visibility.Private,
    type: "server",
  });

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    async function loadServerData() {
      if (serverId) {
        const serverData = await getServerDetail(serverId);
        //if (!isWithErrorsObject(serverData)) {
        setServer({
          name: serverData.name || "",
          serverPath: serverData.serverPath || "",
          description: serverData.description,
          tags: serverData.tags?.join(", ") || "",
          visibility: serverData.visibility || schemas.Visibility.Private,
          type: "server",
        });
      }
      // }
    }

    void loadServerData();
  }, [serverId]);

  const form = useForm({
    resolver: zodResolver(MCPServerOptionsWithTagStringSchema),
    values: server,
  });

  async function onSubmit(values: MCPServerOptionsWithTagString) {
    const serverData = {
      ...values,
      tags: values.tags
        .split(",")
        .filter((t) => !!t)
        .map((t) => t.trim()),
    };

    try {
      // Check if we are creating a new server or editing an existing one
      if (serverId) {
        // Update existing server
        await updateServer(serverId, serverData);
      } else {
        // Create new server
        await createServer(serverData);
      }

      setDialogOpen(false);
      if (onAccept) {
        return onAccept();
      }
    } catch (e: unknown) {
      console.error(e);
      toast.error(exceptionToMessage(e));
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => setDialogOpen(open)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{serverId ? "Edit" : "New"} MCP Server</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ScrollArea className="h-[60vh]">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Server Name</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        Name to assign to this server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Server Description</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        A short description for the server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="serverPath"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Server Path</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter the path segment that to reach the server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Tags (comma-separated)</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        List of tags separated by a comma
                      </FormDescription>
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
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? "Saving..."
                    : serverId
                      ? "Edit Server"
                      : "Create Server"}
                </Button>
              </DialogFooter>
            </ScrollArea>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
