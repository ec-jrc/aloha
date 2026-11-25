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
import { provideOIDC } from "../../src/injector/provide-oidc";

describe("provideOIDC", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should provide OIDC configuration with defaults", () => {
    delete process.env.OIDC_UNKNOWN_USERS_PERMISSIONS;
    delete process.env.OIDC_ENABLED;
    delete process.env.OIDC_USE_IDENTITY_PROPAGATION_SERVICE;
    delete process.env.OIDC_UNKNOWN_USERS_ALLOW;
    delete process.env.OIDC_SCOPE;
    delete process.env.OIDC_UNKNOWN_USERS_PERMISSIONS;
    delete process.env.OIDC_IDENTITY_PROPAGATION_REGISTRAR_PATH;
    delete process.env.OIDC_IDENTITY_PROPAGATION_SERVICE_PATH;
    delete process.env.OIDC_USE_IDENTITY_PROPAGATION_REGISTRAR;

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcEnabled")).to.be.false;
    expect(injector.resolve("oidcScope")).to.equal("openid email profile");
    expect(injector.resolve("oidcUseIdentityPropagationService")).to.be.false;
    expect(injector.resolve("oidcUnknownUsersAllow")).to.be.false;
    expect(injector.resolve("oidcUnknownUsersPermissions")).to.deep.equal([]);
    expect(injector.resolve("oidcIdentityPropagationService")).to.be.undefined;
    expect(injector.resolve("oidcIdentityPropagationRegistrar")).to.be
      .undefined;
    expect(injector.resolve("oidcAlohaTokenSetProvider")).to.be.undefined;
  });

  it("should enable OIDC when configured", () => {
    process.env.OIDC_ENABLED = "true";
    process.env.OIDC_ISSUER_URL = "https://example.com";
    process.env.OIDC_CLIENT_ID = "my-client";
    process.env.OIDC_CODE_REDIRECT_URI = "https://example.com/callback";

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcEnabled")).to.be.true;
    expect(injector.resolve("oidcIssuerUrl")).to.equal("https://example.com");
    expect(injector.resolve("oidcClientId")).to.equal("my-client");
    expect(injector.resolve("oidcCodeRedirectUri")).to.equal(
      "https://example.com/callback"
    );
  });

  it("should use production home in production mode", () => {
    const baseInjector = createInjector().provideValue("isProduction", true);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcHome")).to.equal("/");
  });

  it("should use OIDC_HOME env in non-production mode", () => {
    process.env.OIDC_HOME = "http://localhost:3000/";

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcHome")).to.equal("http://localhost:3000/");
  });

  it("should default OIDC_HOME to localhost:5173 in non-production mode", () => {
    delete process.env.OIDC_HOME;

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcHome")).to.equal("http://localhost:5173/");
  });

  it("should provide oidcJWKS from env", () => {
    process.env.OIDC_JWKS = '{"keys":[]}';

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcJWKS")).to.equal('{"keys":[]}');
  });

  it("should parse unknown users permissions", () => {
    process.env.OIDC_UNKNOWN_USERS_ALLOW = "true";
    process.env.OIDC_UNKNOWN_USERS_PERMISSIONS = "CLIENTS_READ,SERVERS_READ";

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcUnknownUsersAllow")).to.be.true;
    expect(injector.resolve("oidcUnknownUsersPermissions")).to.deep.equal([
      "CLIENTS_READ",
      "SERVERS_READ",
    ]);
  });

  it("should set custom OIDC scope", () => {
    process.env.OIDC_SCOPE = "openid custom";

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcScope")).to.equal("openid custom");
  });

  it("should enable identity propagation service when flag is set", () => {
    process.env.OIDC_USE_IDENTITY_PROPAGATION_SERVICE = "true";
    process.env.OIDC_USE_IDENTITY_PROPAGATION_REGISTRAR = "false";

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcUseIdentityPropagationService")).to.be.true;
    expect(injector.resolve("oidcIdentityPropagationRegistrar")).to.be.undefined;
    expect(injector.resolve("oidcIdentityPropagationService")).to.be.a(
      "promise"
    );
    expect(injector.resolve("oidcAlohaTokenSetProvider")).to.be.a("function");
  });

  it("should enable identity propagation service when service path is set", () => {
    process.env.OIDC_IDENTITY_PROPAGATION_SERVICE_PATH = "./service.js";
    process.env.OIDC_USE_IDENTITY_PROPAGATION_REGISTRAR = "false";

    const baseInjector = createInjector().provideValue("isProduction", false);
    const injector = provideOIDC(baseInjector);

    expect(injector.resolve("oidcUseIdentityPropagationService")).to.be.true;
    expect(injector.resolve("oidcIdentityPropagationService")).to.be.a(
      "promise"
    );
  });
});
