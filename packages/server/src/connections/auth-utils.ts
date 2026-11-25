import { OAuthClientProvider } from "@modelcontextprotocol/client";

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
import { schemas } from "aloha-shared";
import {
  TokenExchangeAuthProvider,
  TokenSetProvider,
} from "../middleware/oidc/oidc-support";

export function getAdditionalAuthenticationHeaders(
  authentication: schemas.Authentication,
  tokenSetProvider: TokenSetProvider | undefined
) {
  let additionalHeaders: { [k: string]: string } | undefined;
  let authProvider: OAuthClientProvider | undefined;

  switch (authentication.type) {
    case "none":
      break;
    case "basic": {
      additionalHeaders = {
        Authorization:
          "Basic " +
          btoa(authentication.username + ":" + authentication.password),
      };
      break;
    }
    case "token": {
      additionalHeaders = {
        Authorization: "Bearer " + authentication.token,
      };
      break;
    }
    case "oidc_client_secret": {
      if (!tokenSetProvider) {
        throw Error(`TokenSet is undefined, cannot exchange it`);
      }
      authProvider = new TokenExchangeAuthProvider(
        authentication.clientId,
        tokenSetProvider
      );
    }
  }
  return { additionalHeaders, authProvider };
}
