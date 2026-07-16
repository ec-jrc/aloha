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

import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { useService } from "@/hooks/use-service";
import {
  isConnectionRegisteredWithIdentityPropagationService,
  registerWithIdentityPropagationService,
  unregisterWithIdentityPropagationService,
} from "@/services/clients";
import { isWithErrorsObject, WithErrors } from "@/services/utils";
import {
  IdentificationIcon,
  LinkIcon,
  LinkSlashIcon,
} from "@heroicons/react/16/solid";
import { schemas } from "aloha-shared";
import { useMemo, useState } from "react";
import ConfirmDialog from "./confirm-dialog";
import { toast } from "sonner";
import {
  isAgentRegisteredWithIdentityPropagationService,
  registerAgentWithIdentityPropagationService,
  unregisterAgentWithIdentityPropagationService,
} from "@/services/agents";
type Props = {
  item:
    | schemas.AgentWithId
    | WithErrors<schemas.AgentWithId>
    | schemas.MCPConnectionOptionsWithId
    | WithErrors<schemas.MCPConnectionOptions>;
};

// const ClientRegistrationMetadataSchema = z.object({
//   redirect_uris: z.array(z.string().min(1)),
//   client_name: z.string(),
// });
//
// type ClientRegistrationMetadata = z.infer<
//   typeof ClientRegistrationMetadataSchema
// >;

// function OIDCFormData({ item, children }: Props & { children: ReactNode }) {
//   const [opened, setOpened] = useState(false);
//   const form = useForm({
//     resolver: zodResolver(ClientRegistrationMetadataSchema),
//     // values: {
//     //   name: client?.name || "",
//     //   description: client?.description || "",
//     //   serverUrl: client?.serverUrl || "",
//     //   serverProtocol: client?.serverProtocol || "http",
//     //   authentication: client?.authentication || { type: "none" },
//     //   tags: client?.tags?.join(", ") || "",
//     //   type: "client",
//     // },
//   });
//
//   async function onSubmit(values: ClientRegistrationMetadata) {}
//
//   return (
//     <Dialog open={opened} onOpenChange={setOpened}>
//       <DialogTrigger asChild>{children}</DialogTrigger>
//       <DialogContent className="!max-w-[90vw]">
//         <DialogHeader>
//           <DialogTitle>OIDC Registration</DialogTitle>
//         </DialogHeader>
//
//         <Form {...form}>
//           <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
//             <ScrollArea className="h-[60vh]">
//               <div className="grid grid-cols-2 gap-4">
//                 <FormField
//                   control={form.control}
//                   name="client_name"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>Client Name</FormLabel>
//                       <FormControl>
//                         <Input {...field} />
//                       </FormControl>
//                       <FormDescription>The name for the client</FormDescription>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//
//                 <FormField
//                   control={form.control}
//                   name="redirect_uris"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>Redirect URI</FormLabel>
//                       <FormControl>
//                         <Input {...field} />
//                       </FormControl>
//                       <FormDescription>The URL the browser should </FormDescription>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//               </div>
//             </ScrollArea>
//           </form>
//         </Form>
//       </DialogContent>
//     </Dialog>
//   );
// }
//
export function OIDCRegistration({ item }: Props) {
  const [operating, setOperating] = useState(false);
  const permissionChecker = usePermissionChecker();
  const canSeePermissionBox = useMemo(() => {
    return (
      item &&
      item.authentication?.type === "oidc_client_secret" &&
      (permissionChecker.isAdministrator() ||
        permissionChecker.hasOwnership(item))
    );
  }, [item, permissionChecker]);

  const [loading, registration] = useService(
    async () => {
      if (
        canSeePermissionBox &&
        !isWithErrorsObject(item) &&
        item.authentication?.type === "oidc_client_secret"
      ) {
        if ("id" in item) {
          if (item.type === "client") {
            return await isConnectionRegisteredWithIdentityPropagationService(
              item.id
            );
          } else {
            return await isAgentRegisteredWithIdentityPropagationService(
              item.id
            );
          }
        }
      }
    },
    [canSeePermissionBox, item],
    null,
    [!operating]
  );

  if (!canSeePermissionBox) return null;

  const registrationStatus = registration?.registered;

  async function registerOIDCClient(registering: boolean) {
    if (!isWithErrorsObject(item) && "id" in item) {
      try {
        setOperating(true);
        if (registering) {
          if (item.type === "client") {
            await registerWithIdentityPropagationService(item.id);
          } else {
            await registerAgentWithIdentityPropagationService(item.id);
          }
          toast.info("Registration succeeded");
        } else {
          if (item.type === "client") {
            await unregisterWithIdentityPropagationService(item.id);
          } else {
            await unregisterAgentWithIdentityPropagationService(item.id);
          }
          toast.info("Unregistration succeeded");
        }
      } catch (err) {
        console.error("Error while operating with the OIDC service", err);
        toast.error("Error while operating with the OIDC service");
      } finally {
        setOperating(false);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          OIDC Registration
        </h3>
      </div>

      <div className="space-y-4">
        {/* Owner Section */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
              <IdentificationIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Registration Status
              </dt>
              <dd className="text-sm font-medium text-gray-900">
                {loading
                  ? "Loading..."
                  : registrationStatus === true
                    ? "Registered"
                    : registrationStatus === false
                      ? "Not registered"
                      : "Loading..."}
              </dd>
            </div>
          </div>
          {registrationStatus === false && !loading && (
            <button
              disabled={operating}
              className="flex items-center gap-1 px-2 py-2 text-xs font-medium bg-blue-100 rounded-md transition-colors duration-150"
              onClick={() => registerOIDCClient(true)}
            >
              <>
                <LinkIcon className="w-3 h-3" />
                {operating ? "Please wait..." : "Register"}
              </>
            </button>
          )}

          {registrationStatus === true && !loading && (
            <ConfirmDialog
              onClick={() => registerOIDCClient(false)}
              message={`You are going to unregister the this client from the OIDC server`}
            >
              <button
                disabled={operating}
                className="flex items-center gap-1 px-2 py-2 text-xs font-medium bg-red-100 rounded-md transition-colors duration-150"
              >
                <>
                  <LinkSlashIcon className="w-3 h-3" />
                  {operating ? "Please wait..." : "Unregister"}
                </>
              </button>
            </ConfirmDialog>
          )}
        </div>
      </div>
    </div>
  );
}
