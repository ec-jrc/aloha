import { AuthInfo } from "@modelcontextprotocol/server";

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
import { Request } from "express";
import "express-session";
import { isDefined } from "./utils.js";
import { UserPrincipal } from "./authentication-strategy-types.js";

export * from "./authentication-strategy-types.js";

declare module "express-session" {
  interface SessionData {
    user: UserPrincipal;
  }
}

export function storeUserIntoSession(req: Request, user: UserPrincipal): void {
  req.session.user = user;
}

export function hasRequestAuthInfoField(req: Request): req is Request & {
  auth: AuthInfo & { extra: { user: UserPrincipal } };
} {
  const reqAny = req as unknown as {
    auth?: AuthInfo & { extra?: { user: UserPrincipal } };
  };
  return (
    isDefined(reqAny.auth) &&
    isDefined(reqAny.auth.token) &&
    isDefined(reqAny.auth.clientId) &&
    isDefined(reqAny.auth.extra?.user)
  );
}

export function getUserFromSession(req: Request): UserPrincipal {
  if (req.session && req.session.user) {
    return req.session.user;
  }
  if (hasRequestAuthInfoField(req)) {
    return req.auth.extra.user;
  }
  throw new Error("User not found, please call isUserAuthenticated first");
}

export function clearSession(req: Request, callback: (err: unknown) => void) {
  req.session.destroy(callback);
}

export function isUserAuthenticated(req: Request) {
  return req.session?.user !== undefined || hasRequestAuthInfoField(req);
}
