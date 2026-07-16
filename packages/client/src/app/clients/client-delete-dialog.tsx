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
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useService } from "@/hooks/use-service";
import { getServersListByConnectionId } from "@/services/servers";
import { WithErrors } from "@/services/utils";
import { TrashIcon } from "@heroicons/react/16/solid";
import { zodResolver } from "@hookform/resolvers/zod";
import { schemas } from "aloha-shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { deleteConnection } from "../../services/clients";
import { exceptionToMessage } from "../../utils/type-utils";

export default function MCPClientDeleteDialog({
  disabled,
  client,
}: {
  disabled: boolean;
  client:
    | schemas.MCPConnectionOptionsWithId
    | WithErrors<schemas.MCPConnectionOptionsWithId>;
}) {
  const DeleteFormSchema = z.object({
    name: z.literal(client.name),
  });

  const navigate = useNavigate();

  const [deleteFormOpen, setDeleteFormOpen] = useState(false);
  const [isLoading, serversImpacted] = useService(
    async (id: string | undefined, opened: boolean) => {
      if (id && opened) {
        return await getServersListByConnectionId(id);
      } else {
        return [];
      }
    },
    [client.id, deleteFormOpen],
    []
  );

  const form = useForm({
    resolver: zodResolver(DeleteFormSchema),
    values: {
      name: "",
    },
  });

  async function onSubmit() {
    try {
      if (client.id) {
        await deleteConnection(client.id);
        setDeleteFormOpen(false);
        void navigate(`/clients`);
      }
      return null;
    } catch (e) {
      console.error(e);
      toast.error(exceptionToMessage(e));
    }
  }

  return (
    <>
      <Dialog open={deleteFormOpen} onOpenChange={setDeleteFormOpen}>
        <DialogTrigger asChild disabled={disabled}>
          <Button
            variant="destructive"
            data-testid="client-delete-button-witness"
          >
            <TrashIcon /> Delete Client
          </Button>
        </DialogTrigger>
        {deleteFormOpen && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Are you really sure {isLoading && " - Loading..."}
              </DialogTitle>
            </DialogHeader>
            <div>
              <p>Are you sure you want to delete the client?</p>
              {serversImpacted.length > 0 && (
                <>
                  <p>
                    The servers listed here below will be updated by deleting
                    the connection to the client.
                  </p>
                  <Separator className="mt-2 mb-2" />
                  <ul>
                    {serversImpacted.map((e) => (
                      <li key={e.id}>
                        <b>{e.name} </b> - {e.serverPath}
                      </li>
                    ))}
                  </ul>
                  <Separator className="mt-2 mb-2" />
                </>
              )}
              To delete the client, type{" "}
              <b>
                "
                {
                  <span data-testid="client-name-holder-witness">
                    {client.name}
                  </span>
                }
                "{" "}
              </b>
              in the text box.
            </div>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="w-auto">
                <FormField
                  name="name"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          name="name"
                          disabled={isLoading}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDeleteFormOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      data-testid="client-delete-confirm-button-witness"
                      type="submit"
                      disabled={form.formState.isSubmitting || isLoading}
                      variant="destructive"
                    >
                      {form.formState.isSubmitting
                        ? "Deleting..."
                        : "Delete connection"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
