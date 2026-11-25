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
import AllowedHttpHeadersField from "@/components/allowed-http-headers-field";
import { getAllowedHttpHeadersOverrides } from "@/services/hub";
import {
  headerRowsToObject,
  headersObjectToRows,
} from "@/utils/http-headers-utils";
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
  createAgent,
  getAgentDetail,
  isAgentRegisteredWithIdentityPropagationService,
  updateAgent,
} from "@/services/agents";
// import { isWithErrorsObject } from "@/services/utils";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useService } from "@/hooks/use-service";
import { isWithErrorsObject } from "@/services/utils";
import { generateRandomString } from "@/utils/string-utils";
import { exceptionToMessage } from "@/utils/type-utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

const AgentOptionsWithTagStringSchema =
  endpoints_schemas.AgentCreateSchema.omit({
    allowedHttpHeaders: true,
  }).merge(
    z.object({
      tags: z.string(),
      allowedHttpHeaders: z
        .array(
          z.object({
            key: z.string(),
            value: z.string(),
            override: z.boolean(),
          })
        )
        .optional(),
    })
  );
type AgentOptionsWithTagString = z.infer<
  typeof AgentOptionsWithTagStringSchema
>;

type Props = {
  agentId: string | undefined;
  trigger?: React.ReactNode;
  onAccept?: () => Promise<void>;
};

export default function AgentEditDialog({
  agentId: serverId,
  trigger,
  onAccept,
}: Props) {
  const [server, setServer] = useState<AgentOptionsWithTagString>({
    name: "",
    serverPath: "",
    description: "",
    tags: "",
    serverProtocol: "http",
    serverUrl: "",
    authentication: {
      type: "none",
    },
    allowedHttpHeaders: [],
    connections: [],
    projects: [],
    type: "agent",
  });

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  const [, allowedHttpHeadersOverrides] = useService(
    async () => await getAllowedHttpHeadersOverrides(),
    [dialogOpen],
    []
  );

  useEffect(() => {
    async function loadServerData() {
      if (serverId && dialogOpen) {
        const serverData = await getAgentDetail(serverId);
        // if (!isWithErrorsObject(serverData)) {
        setServer({
          name: serverData.name,
          serverPath: serverData.serverPath,
          serverProtocol: serverData.serverProtocol,
          serverUrl: serverData.serverUrl,
          authentication: serverData.authentication,
          connections: serverData.connections,
          projects: serverData.projects,
          description: serverData.description,
          tags: serverData.tags?.join(", ") || "",
          allowedHttpHeaders: headersObjectToRows(
            serverData.allowedHttpHeaders,
            allowedHttpHeadersOverrides
          ),
          visibility: serverData.visibility || schemas.Visibility.Private,
          type: "agent",
        } as AgentOptionsWithTagString);
        // }
      }
    }

    void loadServerData();
  }, [serverId, dialogOpen, allowedHttpHeadersOverrides]);

  const [loadingOIDCRegistration, registration] = useService(
    async () => {
      if (
        !!server &&
        serverId &&
        !isWithErrorsObject(server) &&
        server.authentication?.type === "oidc_client_secret"
      ) {
        return await isAgentRegisteredWithIdentityPropagationService(serverId);
      } else {
        return null;
      }
    },
    [server, dialogOpen, serverId],
    null
  );
  const oidcFieldsDisabled = registration?.registered !== false;

  const form = useForm({
    resolver: zodResolver(AgentOptionsWithTagStringSchema),
    values: server,
  });

  async function onSubmit(values: AgentOptionsWithTagString) {
    const serverData = {
      ...values,
      tags: values.tags
        .split(",")
        .filter((t) => !!t)
        .map((t) => t.trim()),
      allowedHttpHeaders: headerRowsToObject(values.allowedHttpHeaders),
    };

    try {
      // Check if we are creating a new server or editing an existing one
      if (serverId) {
        // Update existing server
        await updateAgent(serverId, serverData);
      } else {
        // Create new server
        await createAgent(serverData);
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

  const authentication = useWatch({ control: form.control, name: "authentication" });

  const serverProtocol = useWatch({
    control: form.control,
    name: "serverProtocol",
  });

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => setDialogOpen(open)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {dialogOpen && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{serverId ? "Edit" : "New"} Agent</DialogTitle>
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
                        <FormLabel>Agent Name</FormLabel>
                        <FormControl>
                          <Input type="text" {...field} />
                        </FormControl>
                        <FormDescription>
                          Name to assign to this agent
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
                        <FormLabel>Agent Description</FormLabel>
                        <FormControl>
                          <Input type="text" {...field} />
                        </FormControl>
                        <FormDescription>
                          A short description for the agent
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
                        <FormLabel>Agent Path</FormLabel>
                        <FormControl>
                          <Input type="text" {...field} />
                        </FormControl>
                        <FormDescription>
                          Enter the path segment that to reach the Agent
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <div className="flex flex-row items-center mb-4">
                  <FormField
                    control={form.control}
                    name="serverProtocol"
                    render={({ field }) => (
                      <FormItem className="w-1/2">
                        <FormLabel>Server Protocol</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select protocol" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="a2a">A2A</SelectItem>
                            <SelectItem value="http">
                              Streamable HTTP
                            </SelectItem>
                            {/* [SSE-SUPPORT-REMOVED] restore the legacy SSE protocol option
                            <SelectItem value="sse">SSE (legacy)</SelectItem>
                            */}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Connection protocol type
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="serverUrl"
                    render={({ field }) => (
                      <FormItem className="w-1/2">
                        <FormLabel>Server URL</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormDescription>
                          The host to connect to
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="authentication.type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication Type</FormLabel>

                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select the authentication type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="basic">Basic Auth</SelectItem>
                          <SelectItem value="token">Token</SelectItem>
                          <SelectItem value="oidc_client_secret">
                            OIDC Client Secret
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The authentication used by the client, select "none"" if
                        not available. The OIDC Client Secret Password is not
                        used while authenticating, it's just a field used to
                        store/generate e password and is sent in case of dynamic
                        registration issued by Aloha. To change OIDC credential,
                        the client must not be registered on the OIDC server.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {authentication?.type === "basic" && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="authentication.username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            The username to use to connect to the client
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="authentication.password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            The password to use to connect to the client
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {authentication?.type === "token" && (
                  <FormField
                    control={form.control}
                    name="authentication.token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Token</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} />
                        </FormControl>
                        <FormDescription>
                          The token used to connect to the client
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {authentication?.type === "oidc_client_secret" &&
                  loadingOIDCRegistration && (
                    <div className="ml-2">
                      <Label>Please wait...</Label>
                    </div>
                  )}

                {authentication?.type === "oidc_client_secret" &&
                  !loadingOIDCRegistration && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="authentication.clientId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Id</FormLabel>
                            <FormControl>
                              <div className="flex">
                                <Input
                                  {...field}
                                  className="mr-2"
                                  disabled={registration?.registered === true}
                                />
                                <Button
                                  disabled={oidcFieldsDisabled}
                                  type="button"
                                  onClick={() =>
                                    field.onChange(generateRandomString())
                                  }
                                >
                                  Generate
                                </Button>
                              </div>
                            </FormControl>
                            <FormDescription>
                              The Client ID the client uses to connect to the
                              IDP. This field is used to obtain a bearer token
                              to connect to the client and must be the same
                              value used by the client to connect to the IDP
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="authentication.clientSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Secret</FormLabel>
                            <FormControl>
                              <div className="flex">
                                <Input
                                  {...field}
                                  className="mr-2"
                                  disabled={oidcFieldsDisabled}
                                />
                                <Button
                                  disabled={oidcFieldsDisabled}
                                  type="button"
                                  onClick={() =>
                                    field.onChange(generateRandomString())
                                  }
                                >
                                  Generate
                                </Button>
                              </div>
                            </FormControl>
                            <FormDescription>
                              The Client Secret the client uses to connect to
                              the IDP, this is just a place to store this
                              information. This field is not shared with any
                              party and you are free to let it blank
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

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

                {serverProtocol === "http" && (
                  <AllowedHttpHeadersField
                    control={form.control}
                    name="allowedHttpHeaders"
                    overridesWhitelist={allowedHttpHeadersOverrides}
                    description="Custom HTTP headers sent with every request to the agent over the Streamable HTTP transport."
                  />
                )}

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
                        ? "Edit Agent"
                        : "Create Agent"}
                  </Button>
                </DialogFooter>
              </ScrollArea>
            </form>
          </Form>
        </DialogContent>
      )}
    </Dialog>
  );
}
