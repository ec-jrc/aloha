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
import { isWithErrorsObject, WithErrors } from "@/services/utils";
import { generateRandomString } from "@/utils/string-utils";
import { exceptionToMessage, hasMessageField } from "@/utils/type-utils";
import { DocumentPlusIcon } from "@heroicons/react/16/solid";
import { Pencil } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { endpoints_schemas, schemas } from "aloha-shared";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { catchError, filter, map, of, tap } from "rxjs";
import { toast } from "sonner";
import { z } from "zod";
import {
  createConnection,
  editConnection,
  isConnectionRegisteredWithIdentityPropagationService,
} from "../../services/clients";

const MCPConnectionOptionsWithTagStringSchema =
  endpoints_schemas.MCPConnectionOptionsCreateSchema.omit({ tags: true }).and(
    z.object({
      tags: z.string(),
    })
  );
type MCPConnectionOptionsWithTagString = z.infer<
  typeof MCPConnectionOptionsWithTagStringSchema
>;

interface CreateMessage {
  type: "error" | "info";
  message: string;
}

function prepareNewConnectionData(values: MCPConnectionOptionsWithTagString) {
  // return endpoints_schemas.MCPConnectionOptionsCreateSchema.parse({
  //   ...prepareEditConnectionData(values),
  // });
  return prepareEditConnectionData(values);
}

function prepareEditConnectionData(values: MCPConnectionOptionsWithTagString) {
  return endpoints_schemas.MCPConnectionOptionsCreateSchema.parse({
    name: values.name,
    description: values.description,
    serverUrl: values.serverUrl,
    serverProtocol: values.serverProtocol ?? "http",
    type: "client",
    tags: values.tags
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e !== ""),
    authentication: values.authentication
      ? { ...values.authentication }
      : { type: "none" },
    // authentication: {
    //   ...(values.authentication?.type === "basic"
    //     ? {
    //         type: "basic",
    //         username: values.authentication?.username,
    //         password: values.authentication?.password,
    //       }
    //     : values.authentication?.type === "token"
    //       ? {
    //           type: "token",
    //           token: values.authentication?.token,
    //         }
    //       : values.authentication?.type === "oidc_client_secret"
    //         ? {
    //             type: "oidc_client_secret",
    //             clientId: values.authentication.clientId,
    //             clientSecret: values.authentication.clientSecret,
    //           }
    //         : { type: "none" }),
    // },
  });
}

function createMessageToReactNode(message: CreateMessage): React.ReactNode {
  switch (message.type) {
    case "info":
      return <div>{message.message}</div>;
    case "error":
      return <div className="text-red-600">{message.message}</div>;
  }
}

export default function MCPClientEditDialog({
  disabled,
  client,
}: {
  disabled: boolean;
  client:
    | schemas.MCPConnectionOptionsWithId
    | WithErrors<schemas.MCPConnectionOptionsWithId>
    | undefined;
}) {
  const [editFormOpen, setEditFormOpen] = useState<boolean>(false);
  const [createConnectionDialogOpen, setCreateConnectionDialogOpen] =
    useState<boolean>(false);

  const navigate = useNavigate();

  const [createMessages, setCreateMessages] = useState<CreateMessage[]>([]);

  const [loadingOIDCRegistration, registration] = useService(
    async () => {
      if (
        !!client &&
        !isWithErrorsObject(client) &&
        client.authentication?.type === "oidc_client_secret"
      ) {
        return await isConnectionRegisteredWithIdentityPropagationService(
          client.id
        );
      } else {
        return null;
      }
    },
    [client, editFormOpen],
    null
  );
  const form = useForm({
    resolver: zodResolver(MCPConnectionOptionsWithTagStringSchema),
    values: {
      name: client?.name || "",
      description: client?.description || "",
      serverUrl: client?.serverUrl || "",
      serverProtocol: client?.serverProtocol || "http",
      authentication: client?.authentication || { type: "none" },
      tags: client?.tags?.join(", ") || "",
      type: "client",
    },
  });

  async function onSubmitEdit(values: MCPConnectionOptionsWithTagString) {
    if (!client) {
      throw Error(`Bad call, you cannot edit a non existing client`);
    }
    const data = prepareEditConnectionData(values);
    try {
      if (client.id) {
        await editConnection(client.id, {
          ...data,
          visibility: client.visibility,
        });
        void navigate(`/clients`);
      }
    } catch (e) {
      console.error(e);
      toast.error(exceptionToMessage(e));
    }
  }
  async function onSubmitNew(values: MCPConnectionOptionsWithTagString) {
    if (client) {
      throw Error(
        `Bad call, you cannot create a new client if it's already passed as parameter`
      );
    }

    const data = prepareNewConnectionData(values);

    const localCreateMessages: CreateMessage[] = [];

    function updateCreateMessages(m: CreateMessage) {
      localCreateMessages.push(m);
      setCreateMessages([...localCreateMessages]);
    }

    updateCreateMessages({
      type: "info",
      message: `Connecting to ${data.serverUrl}`,
    });

    setCreateConnectionDialogOpen(true);

    let localNewClientId: string | null = null;

    createConnection(data)
      .pipe(
        filter((e) => e !== undefined),
        map((sseResponse) => {
          console.log(sseResponse);
          if (
            localNewClientId == null &&
            sseResponse.content &&
            typeof sseResponse.content == "object" &&
            "id" in sseResponse.content &&
            typeof sseResponse.content.id == "string"
          ) {
            localNewClientId = sseResponse.content.id;
            return {
              type: "info",
              message: `New Client ID: ` + sseResponse.content.id,
            } as CreateMessage;
          }

          return {
            type: "info",
            message: sseResponse.type,
          } as CreateMessage;
        }),
        catchError((error) => {
          const errorMessage: string = hasMessageField(error)
            ? error.message
            : "There was an error with the creation of the connection to the MCP server.";
          return of({
            type: "error",
            message: errorMessage,
          } as CreateMessage);
        }),
        tap({
          next: (message) => {
            updateCreateMessages(message);
          },
          complete: () => {
            const finalMessage: CreateMessage = localNewClientId
              ? {
                  type: "info",
                  message: "Connection created successfully!",
                }
              : {
                  type: "error",
                  message:
                    "It was impossibile to retrieve the Client ID, but the connection has been saved on the DB",
                };
            updateCreateMessages(finalMessage);
          },
        })
      )
      .subscribe();
  }

  async function onSubmit(values: MCPConnectionOptionsWithTagString) {
    if (!client) {
      return onSubmitNew(values);
    } else {
      return onSubmitEdit(values);
    }
  }

  const authentication = useWatch({ control: form.control, name: "authentication" });

  return (
    <>
      <Dialog open={editFormOpen} onOpenChange={setEditFormOpen}>
        <DialogTrigger asChild disabled={disabled}>
          {client ? (
            <Button
              variant="default"
              className="mr-2"
              data-testid="edit-client-button-witness"
            >
              <Pencil /> Edit Client
            </Button>
          ) : (
            <Button
              variant="default"
              className="mr-2"
              data-testid="new-client-button-witness"
            >
              <DocumentPlusIcon /> New Client
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="!max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>
              {client ? "Edit" : "New"} MCP Client Connection
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <ScrollArea className="h-[60vh]">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="w-1/2">
                      <FormLabel>Connection Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>
                        The name for the connection
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
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
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select protocol" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="http">
                              Streamable HTTP
                            </SelectItem>
                            <SelectItem value="sse">SSE (legacy)</SelectItem>
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormDescription>
                        The description for the connection
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags (comma-separated)</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>
                        A comma sperated list of tags (tag1, tag2, ...)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="authentication.type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication Type</FormLabel>

                      <Select
                        disabled={
                          client?.authentication?.type ===
                            "oidc_client_secret" &&
                          (registration?.registered === true ||
                            loadingOIDCRegistration)
                        }
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="client-auth-select-witness">
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
                                  disabled={registration?.registered === true}
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
                                  disabled={registration?.registered === true}
                                />
                                <Button
                                  disabled={registration?.registered === true}
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
              </ScrollArea>

              <div className="flex justify-end gap-4 mt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setEditFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="client-submit-button-witness"
                  type="submit"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting
                    ? "Saving..."
                    : client !== undefined
                      ? "Edit Connection"
                      : "New Connection"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={createConnectionDialogOpen}
        onOpenChange={(open) => {
          setCreateConnectionDialogOpen(open);

          if (open === false) {
            setEditFormOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Creating connection ...</DialogTitle>
          </DialogHeader>
          {createMessages.map((e) => {
            return createMessageToReactNode(e);
          })}
          <DialogFooter className="sm:justify-end">
            <DialogClose asChild>
              <Button
                data-testid="edit-client-create-button-close-witness"
                type="button"
                variant="default"
              >
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
