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
  IdentitySchema,
  ServerMetadata,
  TokenSet,
  TokenSetSchema,
} from "./oidc-support";

import * as openIdClient from "openid-client";

export const IdentityPropagationServiceInfoSchema = z.object({
  provider: z.string(),
});
export type IdentityPropagationServiceInfo = z.infer<
  typeof IdentityPropagationServiceInfoSchema
>;

export const TokenResolutionResultSchema = z.object({
  identity: IdentitySchema,
  tokenSet: TokenSetSchema,
});
export type TokenResolutionResult = z.infer<
  typeof TokenResolutionResultSchema
>;

export interface IdentityPropagationService {
  getServerMetadata(): ServerMetadata;
  getClientRegistration(clientId: string): Promise<ClientRegistrationMetadata>;
  resolveToken(token: string): Promise<TokenResolutionResult>;
  init(): Promise<void>;
  getConfiguration(): Promise<openIdClient.Configuration>;
  getInfo(): Promise<IdentityPropagationServiceInfo>;
  tokenExchange(tokenSet: TokenSet, audience: string): Promise<TokenSet>;
  getUsername(tokenSet: TokenSet): Promise<string>;
  getAlohaTokenSet(forceRefresh?: boolean): Promise<TokenSet>;
}
