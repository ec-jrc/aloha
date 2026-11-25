# Creating a Custom IdentityPropagationService

This document explains how to create a custom IdentityPropagationService for
integration with the Aloha server's OIDC authentication system.

## Overview

An IdentityPropagationService is responsible for managing identity propagation
between different systems in an OpenID Connect environment. It provides methods
for token exchange, user information retrieval, token validation, and server
metadata management.

## Interface Definition

The base `IdentityPropagationService` interface defines the following methods:

```typescript
interface IdentityPropagationService {
  getServerMetadata(): ServerMetadata;
  getClientRegistration(clientId: string): Promise<ClientRegistrationMetadata>;
  resolveToken(token: string): Promise<TokenResolutionResult>;
  init(): Promise<void>;
  getInfo(): Promise<IdentityPropagationServiceInfo>;
  tokenExchange(tokenSet: TokenSet, audience: string): Promise<TokenSet>;
  getUsername(tokenSet: TokenSet): Promise<string>;
  getAlohaTokenSet(): Promise<TokenSet>;
}
```

## Implementation Steps

### 1. Create Your Service Class

Create a new class that implements the `IdentityPropagationService` interface:

```typescript
import {
  IdentityPropagationService,
  IdentityPropagationServiceInfo,
} from "./identity-propagation-service";
import {
  ClientRegistrationMetadata,
  ServerMetadata,
  TokenSet,
} from "./oidc-support";

export class MyCustomIdentityPropagationService
  implements IdentityPropagationService {
  // Your implementation here
}
```

### 2. Implement Required Methods

Implement each method according to your identity provider's requirements:

#### `init()` - Initialize Service

```typescript
async init(): Promise<void> {
  // Initialize your service connection
  // Load configuration, establish connections, etc.
}
```

#### `getInfo()` - Return Service Information

```typescript
getInfo(): Promise<IdentityPropagationServiceInfo> {
  return Promise.resolve({
    provider: "YOUR_PROVIDER_NAME"
  });
}
```

#### `getServerMetadata()` - Retrieve Server Metadata

```typescript
getServerMetadata(): ServerMetadata {
  // Return server metadata from your identity provider
}
```

#### `getClientRegistration()` - Get Client Registration

```typescript
async getClientRegistration(clientId: string):
  Promise<ClientRegistrationMetadata> {
  // Fetch client registration information
}
```

#### `resolveToken()` - Resolve Token Identity and Refresh

```typescript
async resolveToken(token: string): Promise<TokenResolutionResult> {
  // 1. Retrieve the identity/user information attached to the token
  // 2. If the input token is single-use ("consumed"), produce a fresh,
  //    reusable TokenSet that downstream operations can use
}
```

#### `tokenExchange()` - Exchange Tokens

```typescript
async tokenExchange(tokenSet: TokenSet, audience: string): Promise<TokenSet> {
  // Perform token exchange with your identity provider
}
```

#### `getUsername()` - Extract Username

```typescript
async getUsername(tokenSet: TokenSet): Promise<string> {
  // Extract username from token
}
```

#### `getAlohaTokenSet()` - Get Service Token

```typescript
async getAlohaTokenSet(): Promise<TokenSet> {
  // Return token for service-to-service communication
}
```

## Example Implementation Pattern

Here's the actual implementation based on the Keycloak implementation:

```typescript
import { injector } from "../../injector/injector";
import {
  IdentityPropagationService,
  IdentityPropagationServiceInfo,
} from "./identity-propagation-service";
import {
  ClientRegistrationMetadata,
  ClientRegistrationMetadataSchema,
  initOpenIdClientConfiguration,
  ServerMetadata,
  ServerMetadataSchema,
  TokenSet,
  TokenSetSchema,
} from "./oidc-support";
import * as openIdClient from "openid-client";
import * as jose from "jose";
import { getLogger } from "../../injector/provide-logger";

const PROVIDER_NAME = "KEYCLOCK-IDPS";
const logger = getLogger(PROVIDER_NAME);

export class MyCustomIdentityPropagationService
  implements IdentityPropagationService
{
  private oidcConfiguration!: openIdClient.Configuration;
  private alohaTokenSet!: TokenSet;

  /**
   * Initializes the service by setting up the OpenID Connect configuration
   * and obtaining the initial Aloha token set for service-to-service communication.
   */
  async init(): Promise<void> {
    this.oidcConfiguration = await initOpenIdClientConfiguration();
    this.alohaTokenSet = await this.getAlohaTokenSet();
    logger()
      .child({
        alohaTokenSet: this.alohaTokenSet,
      })
      .info("Aloha TokenSet");
  }

  /**
   * Returns information about the identity provider.
   */
  getInfo(): Promise<IdentityPropagationServiceInfo> {
    return Promise.resolve({
      provider: PROVIDER_NAME,
    });
  }

  /**
   * Exchanges a token for another token with a different audience.
   * Used for service-to-service communication where tokens need to be exchanged
   * for access to different resources.
   */
  async tokenExchange(tokenSet: TokenSet, audience: string): Promise<TokenSet> {
    const tokenResponse = await openIdClient.genericGrantRequest(
      this.oidcConfiguration,
      "urn:ietf:params:oauth:grant-type:token-exchange",
      {
        subject_token: tokenSet.access_token,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        audience: audience,
        scope: injector().resolve("oidcScope"),
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      }
    );
    return TokenSetSchema.parse(tokenResponse);
  }

  /**
   * Extracts the username from a token.
   * Uses OpenID Connect UserInfo endpoint to retrieve user information.
   */
  async getUsername(tokenSet: TokenSet): Promise<string> {
    const userInfo = await openIdClient.fetchUserInfo(
      this.oidcConfiguration,
      tokenSet.access_token,
      openIdClient.skipSubjectCheck
    );
    return userInfo.preferred_username!;
  }

  /**
   * Gets the Aloha token set, refreshing it if necessary.
   * Ensures that the service has a valid token for making authenticated requests
   * to other services.
   */
  async getAlohaTokenSet(): Promise<TokenSet> {
    if (!this.alohaTokenSet) {
      this.alohaTokenSet = await this.getCredentialGrantTokenSet();
      return this.alohaTokenSet;
    }

    const accessTokenDecoded = jose.decodeJwt(this.alohaTokenSet.access_token);

    const now = Date.now() / 1000;

    const tokenExpiryTime = accessTokenDecoded.exp || now + 1;

    if (tokenExpiryTime < now) {
      this.alohaTokenSet = await this.getCredentialGrantTokenSet();
    }

    return this.alohaTokenSet;
  }

  /**
   * Resolves a token: retrieves the identity/user attached to it and, when the
   * input token is single-use ("consumed"), returns a fresh, reusable TokenSet.
   */
  public async resolveToken(token: string): Promise<TokenResolutionResult> {
    const introspection = await openIdClient.tokenIntrospection(
      this.oidcConfiguration,
      token
    );
    if (!introspection.active) {
      throw new Error("Token is not active");
    }
    return {
      identity: {
        clientId: introspection.client_id || "unknown client id",
        scope: introspection.scope || "",
        exp: introspection.exp,
        iat: introspection.iat,
        name: introspection.username || "Unknown",
      },
      // Optionally return a fresh TokenSet when the input token is consumed
      tokenSet: undefined,
    };
  }

  /**
   * Retrieves client registration information for a specific client ID.
   * Makes a request to the OpenID Connect registration endpoint to get client details.
   */
  public async getClientRegistration(
    clientId: string
  ): Promise<ClientRegistrationMetadata> {
    const clientEndpoint =
      this.oidcConfiguration.serverMetadata().registration_endpoint;
    const tokenSet = await this.getAlohaTokenSet();
    const resp = await global.fetch(clientEndpoint + "/" + clientId, {
      headers: {
        authorization: "Bearer " + tokenSet.access_token,
      },
    });
    const json = ClientRegistrationMetadataSchema.parse(await resp.json());
    return json;
  }

  /**
   * Retrieves server metadata from the OpenID Connect discovery endpoint.
   * Provides information about the identity provider's capabilities and endpoints.
   */
  public getServerMetadata(): ServerMetadata {
    return ServerMetadataSchema.parse(this.oidcConfiguration.serverMetadata());
  }

  /**
   * Obtains a new token set using client credentials grant.
   * Used when no refresh token is available or when initializing the service.
   */
  private async getCredentialGrantTokenSet() {
    const clientGrant = await openIdClient.clientCredentialsGrant(
      this.oidcConfiguration
    );
    return TokenSetSchema.parse(clientGrant);
  }
}
```

## Integration

To integrate your custom IdentityPropagationService implementation, you need to:

1. Place your implementation file in your project
2. Set the environment variable `OIDC_IDENTITY_PROPAGATION_SERVICE_PATH` to
   point to your implementation file
3. The service will be automatically loaded by the system

For example, if your service is located at `./src/my-custom-idps.ts` and
compiled to `./src/my-custom-idps.js`, set:

```sh
OIDC_IDENTITY_PROPAGATION_SERVICE_PATH=./src/my-custom-idps.js
```

The loading mechanism works as follows:

1. The system checks for the `OIDC_IDENTITY_PROPAGATION_SERVICE_PATH`
   environment variable
2. If set, it dynamically imports your module using `import()`
3. The imported module should export your service as the default export
4. The service is then initialized and made available for use

The service loading occurs in `@packages/server/src/injector/provide-oidc.ts`
at line 99, where it dynamically imports the module specified by the environment
variable.

## Best Practices

1. **Error Handling**: Implement proper error handling for all asynchronous operations
2. **Logging**: Use the provided logger for debugging and monitoring
3. **Token Management**: Handle token expiration and refresh appropriately
4. **Configuration**: Use the injector to resolve configuration values
5. **Validation**: Validate all inputs and outputs using Zod schemas where available

This approach allows you to integrate with any identity provider that supports
OpenID Connect while maintaining compatibility with the existing Aloha
authentication system.
