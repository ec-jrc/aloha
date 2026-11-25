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
import { Request, Response } from "express";
import { authentication_strategy } from "aloha-shared";
import oidcAuthPlugin from "../../src/middleware/oidc-authentication";
import {
  isJwtTokenSetExpired,
  OIDC_PROVIDER_NAME,
  TokenSetSchema,
  storeTokenSetIntoSession,
  getTokenSetFromSession,
} from "../../src/middleware/oidc/oidc-support";
import * as jose from "jose";

describe("oidc-authentication", () => {
  describe("OidcAuthPlugin", () => {
    describe("checkPermissions", () => {
      it("should return true when user has all required permissions", async () => {
        const user: authentication_strategy.UserPrincipal = {
          id: "1", userId: "u1", displayName: "Test",
          permissions: ["CLIENTS_READ", "SERVERS_READ"],
          provider: OIDC_PROVIDER_NAME,
        };
        const result = await oidcAuthPlugin.checkPermissions(user, ["CLIENTS_READ"]);
        expect(result).to.be.true;
      });

      it("should return false when user lacks a permission", async () => {
        const user: authentication_strategy.UserPrincipal = {
          id: "1", userId: "u1", displayName: "Test",
          permissions: ["CLIENTS_READ"],
          provider: OIDC_PROVIDER_NAME,
        };
        const result = await oidcAuthPlugin.checkPermissions(user, ["SERVERS_WRITE"]);
        expect(result).to.be.false;
      });

      it("should return false when provider is not OIDC", async () => {
        const user: authentication_strategy.UserPrincipal = {
          id: "1", userId: "u1", displayName: "Test",
          permissions: ["CLIENTS_READ"],
          provider: "JWT",
        };
        const result = await oidcAuthPlugin.checkPermissions(user, ["CLIENTS_READ"]);
        expect(result).to.be.false;
      });
    });

    describe("login", () => {
      it("should redirect to /api/oauth2/login", async () => {
        const handler = await oidcAuthPlugin.login();
        let redirectUrl = "";
        const mockRes = { redirect: (url: string) => { redirectUrl = url; } } as unknown as Response;
        (handler as any)({} as Request, mockRes, () => {});
        expect(redirectUrl).to.equal("/api/oauth2/login");
      });
    });

    describe("getInfo", () => {
      it("should return OIDC provider name", async () => {
        const info = await oidcAuthPlugin.getInfo();
        expect(info.provider).to.equal("OIDC");
      });
    });
  });

  describe("oidc-support", () => {
    describe("OIDC_PROVIDER_NAME", () => {
      it("should equal OIDC", () => {
        expect(OIDC_PROVIDER_NAME).to.equal("OIDC");
      });
    });

    describe("TokenSetSchema", () => {
      it("should validate a valid token set", () => {
        const result = TokenSetSchema.parse({
          access_token: "abc123",
          expires_in: 3600,
          id_token: "id.token.here",
          refresh_token: "refresh123",
          scope: "openid",
          token_type: "bearer",
        });
        expect(result.access_token).to.equal("abc123");
        expect(result.expires_in).to.equal(3600);
      });

      it("should require access_token", () => {
        expect(() => TokenSetSchema.parse({})).to.throw();
      });

      it("should accept minimal token set", () => {
        const result = TokenSetSchema.parse({ access_token: "token" });
        expect(result.access_token).to.equal("token");
        expect(result.id_token).to.be.undefined;
      });
    });

    describe("isJwtTokenSetExpired", () => {
      it("should return true for expired token", () => {
        const payload = { exp: Math.floor(Date.now() / 1000) - 3600 };
        const token = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify(payload))}.`;
        expect(isJwtTokenSetExpired({ access_token: token })).to.be.true;
      });

      it("should return false for valid token", () => {
        const payload = { exp: Math.floor(Date.now() / 1000) + 3600 };
        const token = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify(payload))}.`;
        expect(isJwtTokenSetExpired({ access_token: token })).to.be.false;
      });

      it("should check id_token before access_token", () => {
        const expiredAccess = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 100 }))}.`;
        const validId = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.`;
        expect(
          isJwtTokenSetExpired({ access_token: expiredAccess, id_token: validId })
        ).to.be.false;
      });
    });

    describe("session token helpers", () => {
      it("should store and retrieve token set from session", () => {
        const mockReq = { session: {} } as unknown as Request;
        const tokenSet = { access_token: "test-token", expires_in: 3600 };

        storeTokenSetIntoSession(mockReq, tokenSet as any);
        const retrieved = getTokenSetFromSession(mockReq);

        expect(retrieved).to.deep.equal(tokenSet);
      });
    });
  });
});
