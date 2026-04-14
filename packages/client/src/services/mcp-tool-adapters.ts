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

import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  MCPServer,
  MCPToolFilterCallable,
  MCPToolFilterStatic,
} from "@openai/agents";
import { getAgentDetail } from "./agents";
import { getConnectionDetail, sendMCPClientRequest } from "./clients";
import {
  AgentInstance,
  AgentInstanceEventCallback,
  createAgentInstance,
  getTestbedAgentDetail,
  sendMessageToAgentInstance,
} from "./testbed-agents";
import { isWithErrorsObject } from "./utils";

type MCPTools = Awaited<ReturnType<MCPServer["listTools"]>>;

type MCPCallToolContent = Awaited<ReturnType<MCPServer["callTool"]>>;

export class AlohaTestbedAgentMCPServer implements MCPServer {
  name: string;
  cacheToolsList: boolean;
  toolFilter?: MCPToolFilterCallable | MCPToolFilterStatic | undefined;
  private agentInstance: AgentInstance | null = null;

  constructor(
    private id: string,
    name: string,
    private eventCallback: AgentInstanceEventCallback,
    private abortController: AbortController
  ) {
    this.name = "AlohaTestbedAgentMCPServer:" + (name || id).trim();
    this.cacheToolsList = false;
  }

  invalidateToolsCache(): Promise<void> {
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    const testbedAgentDetail = await getTestbedAgentDetail(this.id);
    if (isWithErrorsObject(testbedAgentDetail)) {
      throw new Error(`Invalid TestbedAgent with id ` + this.id);
    }
    this.agentInstance = await createAgentInstance(
      testbedAgentDetail,
      this.eventCallback,
      this.abortController
    );
  }
  async close(): Promise<void> {
    this.agentInstance = null;
  }
  async listTools(): Promise<MCPTools> {
    if (!this.agentInstance) {
      throw new Error(`Agent instance is not defined, first call connect()`);
    }
    return [
      {
        name: this.name,
        description: this.agentInstance.agentDetail.description,
        inputSchema: {
          required: ["query"],
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string" },
          },
        },
      },
    ];
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> | null
  ): Promise<MCPCallToolContent> {
    console.log(`Calling testbedAgent as tool`, toolName);

    if (!this.agentInstance) {
      throw new Error(`Agent instance is not defined, first call connect()`);
    }

    if (!args) {
      throw new Error(`arguments not specified`);
    }

    const message = args["query"];

    if (!message || typeof message !== "string") {
      throw new Error(`query parameter is mandatory`);
    }

    console.info(`Calling testbed agent ${this.name} with message: ${message}`);

    const finalMessage = await sendMessageToAgentInstance(
      this.agentInstance,
      message
    );

    if (!finalMessage) {
      return [];
    }

    return [
      {
        type: "text",
        text: finalMessage,
      },
    ];
  }
}

// export class AlohaAgentMCPServer implements MCPServer {
//   name: string;
//   cacheToolsList: boolean;
//   private session: Client | null = null;
//   private id: string;
//   private transport: StreamableHTTPClientTransport | null = null;
//   constructor(id: string, name: string) {
//     this.name = "AlohaAgentMCPServer:" + (name || id).trim();
//     this.cacheToolsList = false;
//     this.id = id;
//   }
//   async connect(): Promise<void> {
//     try {
//       const agentDetail = await getAgentDetail(this.id);

//       this.transport = new StreamableHTTPClientTransport(
//         new URL(
//           `${window.location.protocol}/${window.location.host}/api/mcp/${agentDetail.serverPath}/mcp`
//         )
//       );

//       this.session = new Client({
//         name: this.name,
//         version: "1.0.0",
//       });
//       await this.session.connect(this.transport);
//     } catch (err) {
//       await this.close();
//       throw err;
//     }
//   }
//   async close(): Promise<void> {
//     if (this.transport) {
//       await this.transport.close();
//       this.transport = null;
//     }
//     if (this.session) {
//       await this.session.close();
//       this.session = null;
//     }
//   }

//   async listTools(): Promise<MCPTools> {
//     if (!this.session) {
//       throw new Error(
//         "Server not initialized. Make sure you call connect() first."
//       );
//     }

//     const response = await this.session.listTools();
//     return ListToolsResultSchema.parse(response).tools.map(
//       (e) =>
//         ({
//           name: e.name,
//           inputSchema: e.inputSchema,
//           description: e.description,
//         }) as MCPTool
//     );
//   }

//   async callTool(
//     toolName: string,
//     args: Record<string, unknown> | null
//   ): Promise<MCPCallToolContent> {
//     if (!this.session) {
//       throw new Error(
//         "Server not initialized. Make sure you call connect() first."
//       );
//     }
//     const response = await this.session.callTool({
//       name: toolName,
//       arguments: args ?? {},
//     });
//     const parsed = CallToolResultSchema.parse(response);
//     const result = parsed.content;

//     return result.map((e) => ({
//       type: e.type,
//       text: e.text as string,
//     }));
//   }
// }

export class AlohaMCPServer implements MCPServer {
  name: string;
  cacheToolsList: boolean;
  constructor(
    private id: string,
    name: string,
    private type: string
  ) {
    this.cacheToolsList = false;
    this.name = `Aloha_${type}_MCPServer: ${(name || id).trim()}`;
  }

  invalidateToolsCache(): Promise<void> {
    return Promise.resolve();
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
  async listTools(): Promise<MCPTools> {
    switch (this.type) {
      case "client": {
        const connection = await getConnectionDetail(this.id);
        return (
          connection.tools?.map((e) => {
            return {
              ...e,
              inputSchema: {
                ...e.inputSchema,
                additionalProperties: false,
                required: e.inputSchema.required || [],
                properties: e.inputSchema.properties || {},
              },
            };
          }) || []
        );
      }
      case "agent": {
        const agent = await getAgentDetail(this.id);
        return (
          agent.tools?.map((e) => {
            return {
              ...e,
              inputSchema: {
                ...e.inputSchema,
                additionalProperties: false,
                required: e.inputSchema.required || [],
                properties: e.inputSchema.properties || {},
              },
            };
          }) || []
        );
      }
      default:
        throw new Error(
          `Cannot connect to MCP connection of type ${this.type}`
        );
    }
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> | null
  ): Promise<MCPCallToolContent> {
    const result = await sendMCPClientRequest(
      this.id,
      {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args || undefined,
        },
      },
      CallToolResultSchema
    );
    return result.response.content
      .filter((c) => c.type == "text")
      .map((e) => ({
        type: e.type,
        text: e.text as string,
      }));
  }
}

// export class AlohaAgentMCPServer implements MCPServer {
//   name: string;
//   cacheToolsList: boolean;
//   constructor(
//     private id: string,
//     name: string
//   ) {
//     this.cacheToolsList = false;
//     this.name = "AlohaAgentMCPServer: " + (name || id).trim();
//   }
//   connect(): Promise<void> {
//     return Promise.resolve();
//   }
//   close(): Promise<void> {
//     return Promise.resolve();
//   }
//   async listTools(): Promise<MCPTools> {
//     const connection = await getAgentDetail(this.id);
//     return (
//       connection.tools?.map((e) => {
//         return {
//           ...e,
//           inputSchema: {
//             ...e.inputSchema,
//             additionalProperties: false,
//             required: e.inputSchema.required || [],
//             properties: e.inputSchema.properties || {},
//           },
//         };
//       }) || []
//     );
//   }

//   async callTool(
//     toolName: string,
//     args: Record<string, unknown> | null
//   ): Promise<MCPCallToolContent> {
//     const result = await sendMCPClientRequest(
//       this.id,
//       {
//         method: "tools/call",
//         params: {
//           name: toolName,
//           arguments: args || undefined,
//         },
//       },
//       CallToolResultSchema
//     );
//     return result.content.map((e) => ({
//       type: e.type,
//       text: e.text as string,
//     }));
//   }
// }
