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

import { isWithErrorsObject, WithErrors } from "@/services/utils";
import { Part } from "@a2a-js/sdk";
import { endpoints_schemas, schemas } from "aloha-shared";

export function isA2AAgent<
  T extends
    | schemas.AgentWithId
    | schemas.MCPBaseConnectionWithId
    | schemas.MCPBaseServerWithId
    | endpoints_schemas.AgentDetail,
>(options: T | WithErrors<T>): options is T & { serverProtol: "a2a" } {
  return (
    !isWithErrorsObject(options) &&
    options.type === "agent" &&
    "serverProtocol" in options &&
    options.serverProtocol === "a2a"
  );
}

export type TextPart = Part & {
  content: { $case: "text"; value: string };
};

export function isTextPart(p: Part): p is TextPart {
  return p.content?.$case === "text";
}

export function partText(p: Part): string {
  return p.content?.$case === "text" ? p.content.value : "";
}
