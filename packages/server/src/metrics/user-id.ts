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

import { authentication_strategy } from "aloha-shared";
import { requestContext } from "../middleware/request-context";

/**
 * Resolves the current user id for metrics labelling (`user` label on
 * `aloha_mcp_requests_total`, `aloha_a2a_requests_total`, etc).
 *
 * Reads the ambient request from `requestContext` (AsyncLocalStorage,
 * populated for the lifetime of every `/api/*` request in
 * `express-setup.ts`), so any code running within a request — proxy
 * handlers, MCP session handlers, A2A client methods — can resolve the
 * user without needing a `Request` threaded through every call site.
 *
 * Falls back to `authentication_strategy.ANONYMOUS_USER` when there is no
 * request in flight or the request is unauthenticated.
 */
export function getCurrentUserId(): string {
  const req = requestContext.getStore();
  if (req && authentication_strategy.isUserAuthenticated(req)) {
    return authentication_strategy.getUserFromSession(req).userId;
  }
  return authentication_strategy.ANONYMOUS_USER;
}
