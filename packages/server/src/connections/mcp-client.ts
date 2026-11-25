// [SSE-SUPPORT-REMOVED] Outbound SSE client transport disabled; restore the import, the
// getSSEClientTransportOptions method and the "sse" case in constructTransport together.
import {
  Client,
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
  Transport,
  ClientRequest,
  Prompt,
  Resource,
  ResourceTemplateType,
  Tool,
} from "@modelcontextprotocol/client";
// import { Client, SSEClientTransport, SSEClientTransportOptions, StreamableHTTPClientTransport, StreamableHTTPClientTransportOptions, Transport, ClientRequest, Prompt, Resource, ResourceTemplateType, Tool } from "@modelcontextprotocol/client";

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
import { schemas } from "aloha-shared";
import z from "zod";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { requestContext } from "../middleware/request-context";
import { TokenSetProvider } from "../middleware/oidc/oidc-support";
import {
  hasMessageField,
  promisedStatus,
  PromisedStatus,
  unknownToString,
} from "../utils/type-utils";
import { getAdditionalAuthenticationHeaders } from "./auth-utils";
import { RemoteClient } from "./remote-client";

const logger = getLogger("MCP-CLIENT");

const TIMEOUT_CONNECT_MS = 5000;
const TIMEOUT_MINUTES = 30;
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;

export default class MCPClient implements RemoteClient {
  public client: Client;

  public connectionOptions: schemas.MCPBaseConnectionWithId;

  public resources: Resource[] = [];
  public resourceTemplates: ResourceTemplateType[] = [];
  public prompts: Prompt[] = [];
  public tools: Tool[] = [];

  private _lastListRefresh: number = 0;

  // private transport: Transport;
  private connectPromise: PromisedStatus<boolean> | null = null;

  constructor(
    serverOptions: schemas.MCPBaseConnectionWithId,
    public tokenSetProvider: TokenSetProvider | undefined
  ) {
    this.connectionOptions = serverOptions;
    // this.transport= this.constructTransport(serverOptions);

    this.client = this.constructClient();
  }

  public get sessionId() {
    return this.client.transport?.sessionId;
  }

  public get isConnected() {
    return this.connectPromise?.currentStatus() || false;
  }

  public get isStateful() {
    return this.client.transport?.sessionId !== undefined;
  }

  public get id() {
    return this.connectionOptions.id;
  }

  public async connectClient() {
    const log = logger().child({ clientId: this.connectionOptions.id });
    if (this.connectionOptions.disabled) {
      log.debug("Connection has been disabled");

      this.connectPromise = promisedStatus(false, Promise.resolve(false));
    } else {
      if (this.connectPromise) {
        return this.connectPromise;
      }

      let connectTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const abortController = new AbortController();

      this.connectPromise = promisedStatus(
        false,
        Promise.resolve(
          this.constructTransport(this.connectionOptions, this.tokenSetProvider)
        )
          .then((transport) => {
            log.debug(`Connecting to ` + this.connectionOptions.name);

            const timeoutPromise = new Promise((_, reject) => {
              connectTimeoutId = setTimeout(() => {
                abortController.abort();
                reject(new Error("Timeout error"));
              }, TIMEOUT_CONNECT_MS);
            });

            return Promise.race([
              timeoutPromise,
              this.client.connect(transport, {
                signal: abortController.signal,
              }),
            ]);
          })
          .then(() => {
            log.debug(
              `Connected to ${this.connectionOptions.name}, is stateful: ${this.isStateful}`
            );
            return true;
          })
          .catch(async (err) => {
            log.debug(hasMessageField(err) ? err.message : err);
            await this.close();
            return false;
          })
          .finally(() => {
            clearTimeout(connectTimeoutId);
          })
      );
    }

    return this.connectPromise;
  }

  public async pingClient() {
    const isConnected = await this.connectClient();
    if (!isConnected) {
      return;
    }
    try {
      await this.client.ping({ timeout: TIMEOUT_CONNECT_MS });
    } catch (error: unknown) {
      await this.close();
      logger().child({ connectionId: this.connectionOptions.id }).debug(error);
      throw error;
    }

    // Refresh lists every 30s
    // Servers supporting list_changed notifications will update immediately via constructClient().
    const now = Date.now();
    if (now - this._lastListRefresh >= 30_000) {
      this._lastListRefresh = now;
      await this.refreshLists();
    }
  }

  public async close() {
    const log = logger().child({ clientId: this.connectionOptions.id });
    if (this.client) {
      // Teardown must be best-effort: when the upstream server has gone away,
      // terminateSession()/transport.close() can reject (e.g. ECONNREFUSED on
      // the DELETE). If we let that propagate, `connectPromise` is never reset
      // to null, so `isConnected` keeps reporting the stale "connected" state
      // and the manager never detects the server going down.
      try {
        if (
          this.sessionId &&
          this.client.transport instanceof StreamableHTTPClientTransport
        ) {
          await this.client.transport.terminateSession();
        }
      } catch (error) {
        log.debug(error, "terminateSession failed during close; continuing teardown");
      }
      try {
        await this.client.transport?.close();
      } catch (error) {
        log.debug(error, "transport.close failed during close; continuing teardown");
      }
      try {
        await this.client.close();
      } catch (error) {
        log.debug(error, "client.close failed during close; continuing teardown");
      }
    }
    this.connectPromise = null;
  }

  public async sendRequest<T extends z.ZodType<unknown>>(
    request: ClientRequest,
    schema: T
  ) {
    const isConnected = await this.connectClient();
    const log = logger().child({ clientId: this.connectionOptions.id });
    if (!isConnected) {
      log.error("Unable to send MCP request: client is not connected");
      throw new Error(`Client is not connected`);
    }
    const result = await this.client.request(request, schema, {
      timeout: TIMEOUT_MS,
    });
    return result;
  }

  private async refreshLists() {
    const log = logger().child({ clientId: this.connectionOptions.id });

    const capabilities = this.client.getServerCapabilities();

    const requests: Promise<void>[] = [];

    if (capabilities?.resources) {
      requests.push(
        this.client
          .listResources()
          .then(({ resources }) => {
            this.resources = resources;
          })
          .catch((error) => {
            log.debug(error);
          })
      );

      requests.push(
        this.client
          .listResourceTemplates()
          .then(({ resourceTemplates }) => {
            this.resourceTemplates = resourceTemplates;
          })
          .catch((error) => {
            log.debug(error);
          })
      );
    }

    if (capabilities?.prompts) {
      requests.push(
        this.client
          .listPrompts()
          .then(({ prompts }) => {
            this.prompts = prompts;
          })
          .catch((error) => {
            log.debug(error);
          })
      );
    }

    if (capabilities?.tools) {
      requests.push(
        this.client
          .listTools()
          .then(({ tools }) => {
            this.tools = tools;
          })
          .catch((error: unknown) => {
            const err = error as Partial<Error> | undefined;
            log.warn(
              {
                connection: this.connectionOptions.name,
                errorName: err?.name,
                errorMessage: err?.message ?? unknownToString(error),
                errorStack: err?.stack,
              },
              "Failed to list tools for connection; tools will be empty"
            );
          })
      );
    }

    await Promise.all(requests);
  }

  private constructClient() {
    const client = new Client(
      {
        name: "mcp-hub",
        version: "1.0.0",
      },
      {
        capabilities: {},
        listChanged: {
          tools: {
            onChanged: (err, tools) => {
              if (!err && tools) this.tools = tools;
            },
          },
          prompts: {
            onChanged: (err, prompts) => {
              if (!err && prompts) this.prompts = prompts;
            },
          },
          resources: {
            onChanged: (err, resources) => {
              if (!err && resources) this.resources = resources;
            },
          },
        },
      }
    );

    // Replace Ajv instance before each cacheToolMetadata call so old compiled code can be GC'd
    // const origCacheToolMetadata = client.cacheToolMetadata.bind(client);
    // client.cacheToolMetadata = (tools: Tool[]) => {
    //   self.ajvValidator = new AjvJsonSchemaValidator();
    //   return origCacheToolMetadata(tools);
    // };

    return client;
  }

  // [SSE-SUPPORT-REMOVED] Outbound SSE transport options; restore with the "sse" case in constructTransport.
  // private getSSEClientTransportOptions(
  //   serverOptions: schemas.MCPBaseConnection,
  //   tokenSetProvider: TokenSetProvider | undefined
  // ): SSEClientTransportOptions {
  //   let options: SSEClientTransportOptions = {};
  //   if (serverOptions.authentication) {
  //     const { additionalHeaders, authProvider } =
  //       getAdditionalAuthenticationHeaders(
  //         serverOptions.authentication,
  //         tokenSetProvider
  //       );
  //
  //     if (additionalHeaders) {
  //       options = {
  //         ...options,
  //         eventSourceInit: {
  //           fetch: (url, opts) => {
  //             const headers = opts?.headers || {};
  //
  //             return global.fetch(url, {
  //               ...opts,
  //               headers: { ...headers, ...additionalHeaders },
  //             });
  //           },
  //         },
  //         requestInit: {
  //           headers: additionalHeaders,
  //         },
  //       };
  //     }
  //     if (authProvider) {
  //       options = {
  //         ...options,
  //         authProvider,
  //       };
  //     }
  //   }
  //   return options;
  // }

  private getStreamableHTTPClientTransportOptions(
    serverOptions: schemas.MCPBaseConnection,

    tokenSetProvider: TokenSetProvider | undefined
  ): StreamableHTTPClientTransportOptions {
    let options: StreamableHTTPClientTransportOptions = {};

    const overridesWhitelist = new Set(
      injector().resolve("allowedHttpHeadersOverrides")
    );
    const incomingRequest = requestContext.getStore();
    const incomingHeaders = incomingRequest?.headers;

    const allowedHeaders: Record<string, string> = {};
    for (const [rawName, header] of Object.entries(
      serverOptions.allowedHttpHeaders ?? {}
    )) {
      const name = rawName.trim().toLowerCase();
      if (!name) {
        continue;
      }

      let value = header.value;
      if (header.override && overridesWhitelist.has(name)) {
        const incomingValue = incomingHeaders?.[name];
        if (typeof incomingValue === "string") {
          value = incomingValue;
        } else if (Array.isArray(incomingValue) && incomingValue.length > 0) {
          value = incomingValue.join(", ");
        }
      }

      allowedHeaders[name] = value;
    }

    if (serverOptions.authentication) {
      const { additionalHeaders, authProvider } =
        getAdditionalAuthenticationHeaders(
          serverOptions.authentication,
          tokenSetProvider
        );

      if (additionalHeaders) {
        options = {
          ...options,
          requestInit: {
            headers: additionalHeaders,
          },
        };
      }
      if (authProvider) {
        options = {
          ...options,
          authProvider,
        };
      }
    }

    if (Object.keys(allowedHeaders).length > 0) {
      options = {
        ...options,
        requestInit: {
          ...options.requestInit,
          headers: {
            ...(options.requestInit?.headers as
              | Record<string, string>
              | undefined),
            ...allowedHeaders,
          },
        },
      };
    }

    // Add fetch wrapper to detect session headers
    // options.fetch = async (url, init) => {
    //   const response = await fetch(url, init);
    //   const sessionId = response.headers.get("mcp-session-id");
    //   if (sessionId) {
    //     this._isStateful = true;
    //     this._sessionId = sessionId;
    //   }
    //   return response;
    // };

    return options;
  }

  private constructTransport(
    serverOptions: schemas.MCPBaseConnection,
    tokenSetProvider: TokenSetProvider | undefined
  ): Transport {
    switch (serverOptions.serverProtocol) {
      case "http": {
        const streamableOptions = this.getStreamableHTTPClientTransportOptions(
          serverOptions,
          tokenSetProvider
        );
        return new StreamableHTTPClientTransport(
          new URL(serverOptions.serverUrl),
          streamableOptions
        );
      }
      // [SSE-SUPPORT-REMOVED] Outbound SSE transport; restore with getSSEClientTransportOptions.
      // case "sse": {
      //   const sseOptions = this.getSSEClientTransportOptions(
      //     serverOptions,
      //     tokenSetProvider
      //   );
      //   return new SSEClientTransport(
      //     new URL(`${serverOptions.serverUrl}/sse`),
      //     sseOptions
      //   );
      // }
      default:
        throw new Error(
          `Unsupported transport type: ${serverOptions.serverProtocol}`
        );
    }
  }
}
