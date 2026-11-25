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

import { authentication_strategy, schemas } from "aloha-shared";
import { Injector, Scope } from "typed-inject";
import { Cache } from "../cache/cache-nodecache";
import { TokenResolutionResult } from "../middleware/oidc/identity-propagation-service";

export function provideCaches<T>(injector: Injector<T>) {
  return (
    // .provideClass(
    //   "projectsCache",
    //   Cache<schemas.ProjectWithId>,
    //   Scope.Singleton
    // )
    // .provideClass(
    //   "clientsOptionsCache",
    //   Cache<schemas.MCPConnectionOptionsWithId>,
    //   Scope.Singleton
    // )
    // .provideClass(
    //   "serverOptionsCache",
    //   Cache<schemas.MCPServerOptionsWithId>,
    //   Scope.Singleton
    // )
    injector
      .provideClass("emptyCache", Cache<unknown>, Scope.Transient)
      .provideClass(
        "jwtCache",
        Cache<authentication_strategy.UserPrincipal>,
        Scope.Singleton
      )
      .provideClass("fetchCache", Cache<object>, Scope.Singleton)
      .provideClass(
        "userProjectsCache",
        Cache<schemas.ProjectWithId[]>,
        Scope.Singleton
      )
      // .provideClass("tokensCache", Cache<schemas.JWTTokenWithId>, Scope.Singleton)
      .provideClass("usersCache", Cache<schemas.UserWithId>, Scope.Singleton)
      .provideClass("agentsCache", Cache<schemas.AgentWithId>, Scope.Singleton)
      .provideClass(
        "oidcTokenResolutionCache",
        Cache<TokenResolutionResult>,
        Scope.Singleton
      )
  );
}
