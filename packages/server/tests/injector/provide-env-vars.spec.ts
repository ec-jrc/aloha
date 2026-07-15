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
import { createInjector } from "typed-inject";
import { provideEnvVars } from "../../src/injector/provide-env-vars";

describe("provideEnvVars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw if SERVER_SECRET is missing", () => {
    delete process.env.SERVER_SECRET;
    process.env.CLIENT_SECRET = "test-client";
    expect(() => provideEnvVars(createInjector())).to.throw("SERVER_SECRET is not defined");
  });

  it("should throw if CLIENT_SECRET is missing", () => {
    process.env.SERVER_SECRET = "test-server";
    delete process.env.CLIENT_SECRET;
    expect(() => provideEnvVars(createInjector())).to.throw("CLIENT_SECRET is not defined");
  });

  it("should provide all environment variables", () => {
    process.env.SERVER_SECRET = "test-server";
    process.env.CLIENT_SECRET = "test-client";
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "my-session-secret";
    process.env.SESSION_MAX_AGE = "7200000";
    process.env.DEFAULT_JWT_AUTHENTICATION = "false";
    process.env.AUTHENTICATION_PLUGIN = "/path/to/plugin";

    const injector = provideEnvVars(createInjector());

    expect(injector.resolve("isProduction")).to.be.true;
    expect(injector.resolve("serverSecret")).to.equal("test-server");
    expect(injector.resolve("clientSecret")).to.equal("test-client");
    expect(injector.resolve("sessionSecret")).to.equal("my-session-secret");
    expect(injector.resolve("sessionMaxAge")).to.equal(7200000);
    expect(injector.resolve("defaultJWTAuthentication")).to.be.false;
    expect(injector.resolve("pluginPath")).to.equal("/path/to/plugin");
  });

  it("should default isProduction to false", () => {
    process.env.SERVER_SECRET = "s";
    process.env.CLIENT_SECRET = "c";
    delete process.env.NODE_ENV;

    const injector = provideEnvVars(createInjector());
    expect(injector.resolve("isProduction")).to.be.false;
  });

  it("should throw when SESSION_SECRET is not defined", () => {
    process.env.SERVER_SECRET = "s";
    process.env.CLIENT_SECRET = "c";
    delete process.env.SESSION_SECRET;

    expect(() => provideEnvVars(createInjector())).to.throw(
      "SESSION_SECRET is not defined in the environment variables"
    );
  });

  it("should default sessionMaxAge to 24 hours", () => {
    process.env.SERVER_SECRET = "s";
    process.env.CLIENT_SECRET = "c";
    delete process.env.SESSION_MAX_AGE;

    const injector = provideEnvVars(createInjector());
    expect(injector.resolve("sessionMaxAge")).to.equal(1000 * 60 * 60 * 24);
  });

  it("should default defaultJWTAuthentication to true", () => {
    process.env.SERVER_SECRET = "s";
    process.env.CLIENT_SECRET = "c";
    delete process.env.DEFAULT_JWT_AUTHENTICATION;

    const injector = provideEnvVars(createInjector());
    expect(injector.resolve("defaultJWTAuthentication")).to.be.true;
  });

  it("should default pluginPath to undefined", () => {
    process.env.SERVER_SECRET = "s";
    process.env.CLIENT_SECRET = "c";
    delete process.env.AUTHENTICATION_PLUGIN;

    const injector = provideEnvVars(createInjector());
    expect(injector.resolve("pluginPath")).to.be.undefined;
  });
});
