/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the "Licence");
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/
import z from "zod";

export const ClientWorkflowStateSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "VERIFIED",
]);
export type ClientWorkflowState = z.infer<typeof ClientWorkflowStateSchema>;

export const ClientWorkflowPluginExtraSchema = z.object({
  state: ClientWorkflowStateSchema,
  publishedLink: z.string().optional(),
  verifiedLink: z.string().optional(),
});
export type ClientWorkflowPluginExtra = z.infer<
  typeof ClientWorkflowPluginExtraSchema
>;

export const ItemTypeSchema = z.enum(["client", "agent"]);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const IdAndTypeSchema = z.object({
  id: z.string().min(1),
  type: ItemTypeSchema,
});
