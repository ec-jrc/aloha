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
import {
  authorise,
  setAuthPlugins,
  getAuthPlugins,
} from "../../src/middleware/authorise";
import { authentication_strategy } from "aloha-shared";

describe("authorise", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusCode: number;
  let jsonResponse: any;

  beforeEach(() => {
    statusCode = 0;
    jsonResponse = null;

    mockReq = {
      method: "GET",
      originalUrl: "/test",
      session: {} as any,
    };

    mockRes = {
      status: function (this: unknown, code: number) {
        statusCode = code;
        return mockRes;
      } as any,
      json: function (this: unknown, data: any) {
        jsonResponse = data;
        return mockRes;
      } as any,
    };
  });

  afterEach(() => {
    setAuthPlugins([]);
  });

  it("should pass through when no permissions required", (done) => {
    const middleware = authorise();
    middleware(mockReq as Request, mockRes as Response, () => {
      done();
    });
  });

  it("should return 401 when user not authenticated", (done) => {
    const middleware = authorise(["read"]);
    middleware(mockReq as Request, mockRes as Response, () => {
      done(new Error("Should not call next"));
    });

    setTimeout(() => {
      expect(statusCode).to.equal(401);
      expect(jsonResponse).to.deep.equal({ error: "Not authenticated" });
      done();
    }, 10);
  });

  it("should pass through when no permissions to check", (done) => {
    mockReq.session = {
      user: {
        id: "1",
        userId: "test",
        displayName: "Test",
        permissions: [],
        provider: "test",
      },
    } as any;

    const middleware = authorise([]);
    middleware(mockReq as Request, mockRes as Response, () => {
      done();
    });
  });

  it("should manage auth plugins", () => {
    const mockPlugin: authentication_strategy.AuthenticationStrategy = {
      init: async () => {},
      getAuthenticationMiddleware: async () => (_req, _res, next) => next(),
      checkPermissions: async () => true,
      login: async () => (_req, res) => res.send(),
      logout: async () => (_req, _res, next) => next(),
      getInfo: async () => ({ provider: "test" }),
    };

    setAuthPlugins([mockPlugin]);
    expect(getAuthPlugins()).to.have.lengthOf(1);
  });
});
