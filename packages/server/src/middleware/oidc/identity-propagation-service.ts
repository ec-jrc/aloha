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
import {
  ClientRegistrationMetadata,
  ServerMetadata,
  TokenSet,
} from "./oidc-support";

export const IdentityPropagationServiceInfoSchema = z.object({
  provider: z.string(),
});
export type IdentityPropagationServiceInfo = z.infer<
  typeof IdentityPropagationServiceInfoSchema
>;

export interface IdentityPropagationService {
  getServerMetadata(): ServerMetadata;
  getClientRegistration(clientId: string): Promise<ClientRegistrationMetadata>;
  verifyToken(token: string): Promise<boolean>;
  refreshTokenSet(tokenSet: TokenSet): Promise<TokenSet>;
  init(): Promise<void>;
  getInfo(): Promise<IdentityPropagationServiceInfo>;
  tokenExchange(tokenSet: TokenSet, audience: string): Promise<TokenSet>;
  getUsername(tokenSet: TokenSet): Promise<string>;
  getAlohaTokenSet(forceRefresh?: boolean): Promise<TokenSet>;
}
