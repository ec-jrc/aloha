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
import { schemas } from "aloha-shared";

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
// import { isWithErrorsObject } from "@/services/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  createTestbedAgent,
  getTestbedAgentDetail,
  updateTestbedAgent,
} from "@/services/testbed-agents";
import { isWithErrorsObject } from "@/services/utils";
import { exceptionToMessage } from "@/utils/type-utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type Props = {
  agentId: string | undefined;
  trigger?: React.ReactNode;
  onAccept?: () => Promise<void>;
};

export default function TestbedAgentEditDialog({
  agentId: serverId,
  trigger,
  onAccept,
}: Props) {
  const [server, setServer] = useState<schemas.TestbedAgent>({
    name: "",
    description: "",
    client: {
      apiKey: "",
      baseURL: "",
    },
    model: "",
    prompt: "You are a clever agent",
    useChatCompletions: true,
    creator: "",
    visibility: schemas.Visibility.Private,
    connections: [],
    type: "testbed_agent",
  });

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    async function loadServerData() {
      if (serverId) {
        const serverData = await getTestbedAgentDetail(serverId);
        if (!isWithErrorsObject(serverData)) {
          setServer(serverData);
        }
      }
    }

    void loadServerData();
  }, [serverId]);

  const form = useForm({
    resolver: zodResolver(schemas.TestbedAgentSchema),
    values: server,
  });

  async function onSubmit(values: schemas.TestbedAgent) {
    const serverData = values;
    try {
      if (serverId) {
        await updateTestbedAgent(serverId, serverData);
      } else {
        await createTestbedAgent(serverData);
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
          <DialogTitle>{serverId ? "Edit" : "New"} Testbed Agent</DialogTitle>
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
                      <FormLabel>Testbed Agent Name</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        Name to assign to this testbed agent
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
                      <FormLabel>Testbed Agent Description</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        A short description for the tesstbed agent
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="client.baseURL"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>LLM Base URL</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter the base url to chat with the LLM
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="client.apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormDescription>
                      The api key token used to connect to the LLM
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter the LLM Model name you want to use
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prompt</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormDescription>
                      The prompt instructions for this agent
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
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
                      ? "Edit Testbed Agent"
                      : "Create Testbed Agent"}
                </Button>
              </DialogFooter>
            </ScrollArea>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
