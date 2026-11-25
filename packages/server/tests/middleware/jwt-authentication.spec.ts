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
// [Note: File generated using Generative AI technology]

import { expect } from "chai";
import {
  AGENT_PROJECT,
  AlohaJWTPayload,
} from "../../src/middleware/jwt-authentication";

describe("jwt-authentication", () => {
  it("should export AGENT_PROJECT constant", () => {
    expect(AGENT_PROJECT).to.equal("AGENT");
  });

  describe("AlohaJWTPayload structure", () => {
    it("should accept a payload with the expected fields", () => {
      const payload: AlohaJWTPayload = {
        tokenId: "token123",
        userId: "user456",
        sub: "subject",
        claims: ["ProxyApiAccess"],
        expirationDate: new Date().toISOString(),
      };

      expect(payload.tokenId).to.equal("token123");
      expect(payload.claims).to.deep.equal(["ProxyApiAccess"]);
    });
  });
});
