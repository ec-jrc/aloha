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

import { Injector, Scope } from "typed-inject";
import { ConnectionOptionsRepository } from "../database/repositories/interfaces/connection-options-repository";
import { AgentRepository } from "../database/repositories/interfaces/agent-repository-interface";
import MCPManager from "../connections/mcp-manager";

export function provideMcpManager<
  T extends {
    connectionOptionsRepository: ConnectionOptionsRepository;
    agentRepository: AgentRepository;
  },
>(injector: Injector<T>) {
  return injector.provideClass("mcpManager", MCPManager, Scope.Singleton);
}
