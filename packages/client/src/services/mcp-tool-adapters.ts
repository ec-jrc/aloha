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
import {
  MessageSendParams,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
  Message,
} from "@a2a-js/sdk";
import { endpoints_schemas } from "aloha-shared";
import { getAgentDetail, sendA2AMessageStream } from "./agents";
import { getConnectionDetail, sendMCPClientRequest } from "./clients";
import {
  AgentInstance,
  AgentInstanceEventCallback,
  createAgentInstance,
  getTestbedAgentDetail,
  sendMessageToAgentInstance,
} from "./testbed-agents";
import { isWithErrorsObject } from "./utils";
import { isTextPart } from "@/utils/a2a-utils";

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

export class AlohaA2AAgentMCPServer implements MCPServer {
  name: string;
  cacheToolsList: boolean;
  toolFilter?: MCPToolFilterCallable | MCPToolFilterStatic | undefined;
  private agentDetail: endpoints_schemas.AgentDetail | null = null;

  constructor(
    private id: string,
    name: string
  ) {
    this.name = "AlohaA2AAgent:" + (name || id).trim();
    this.cacheToolsList = false;
  }

  invalidateToolsCache(): Promise<void> {
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    const detail = await getAgentDetail(this.id);
    if (isWithErrorsObject(detail)) {
      throw new Error(`Invalid A2A Agent with id ${this.id}`);
    }
    this.agentDetail = detail;
  }

  async close(): Promise<void> {
    this.agentDetail = null;
  }

  async listTools(): Promise<MCPTools> {
    if (!this.agentDetail) {
      throw new Error("Agent not connected. Call connect() first.");
    }

    const agentCard = this.agentDetail.metadata?.agentCard as
      | {
          description?: string;
          skills?: { name: string; description: string; examples?: string[] }[];
        }
      | undefined;

    const description =
      agentCard?.description || this.agentDetail.name || "A2A remote agent";

    const skillsDescription =
      agentCard?.skills
        ?.map((s) => {
          let skillNameAndDesc = `- ${s.name}: ${s.description}`;
          if (s.examples) {
            skillNameAndDesc += "\n  Examples:\n";
            skillNameAndDesc += s.examples.map((e) => "     + " + e).join("\n");
          }
          return skillNameAndDesc;
        })
        .join("\n") || "";

    const fullDescription = skillsDescription
      ? `${description}\n\nAvailable skills:\n${skillsDescription}`
      : description;

    return [
      {
        name: this.name,
        description: fullDescription,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: {
              type: "string",
              description: "The message/query to send to the remote A2A agent",
            },
          },
        },
      },
    ];
  }

  async callTool(
    _toolName: string,
    args: Record<string, unknown> | null
  ): Promise<MCPCallToolContent> {
    if (!this.agentDetail) {
      throw new Error("Agent not connected. Call connect() first.");
    }

    if (!args || typeof args["query"] !== "string") {
      throw new Error("query parameter is mandatory and must be a string");
    }

    const query = args["query"] as string;

    console.info(`Calling A2A agent ${this.name} with message: ${query}`);

    const message: MessageSendParams = {
      message: {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "user",
        parts: [{ kind: "text", text: query }],
      },
    };

    const responseText = await this.collectA2AResponse(message);

    return responseText
      ? [{ type: "text", text: responseText }]
      : [{ type: "text", text: "A2A agent returned no response" }];
  }

  private async collectA2AResponse(
    message: MessageSendParams
  ): Promise<string> {
    let responseText = "";
    let error: string | null = null;

    await new Promise<void>((resolve) => {
      void sendA2AMessageStream(this.agentDetail!, message, async (event) => {
        if (!("kind" in event)) {
          resolve();
          return;
        }

        switch (event.kind) {
          case "task": {
            const task = event as Task;
            if (task.status?.message?.parts) {
              responseText += task.status.message.parts
                .filter(isTextPart)
                .map((p) => p.text)
                .join("");
            }
            if (task.artifacts) {
              for (const artifact of task.artifacts) {
                responseText += artifact.parts
                  .filter(isTextPart)
                  .map((p) => p.text)
                  .join("");
              }
            }
            if (this.isTerminalState(task.status?.state)) {
              if (task.status?.state === "failed") {
                error = "A2A agent task failed";
              }
              resolve();
            }
            break;
          }
          case "status-update": {
            const statusUpdate = event as TaskStatusUpdateEvent;
            if (statusUpdate.status?.message?.parts) {
              responseText += statusUpdate.status.message.parts
                .filter(isTextPart)
                .map((p) => p.text)
                .join("");
            }
            if (this.isTerminalState(statusUpdate.status?.state)) {
              if (statusUpdate.status?.state === "failed") {
                error = "A2A agent task failed";
              }
              resolve();
            }
            break;
          }
          case "artifact-update": {
            const artifactUpdate = event as TaskArtifactUpdateEvent;
            responseText += artifactUpdate.artifact.parts
              .filter(isTextPart)
              .map((p) => p.text)
              .join("");
            break;
          }
          case "message": {
            const msg = event as Message;
            if (msg.role === "agent" && msg.parts) {
              responseText += msg.parts
                .filter(isTextPart)
                .map((p) => p.text)
                .join("");
            }
            break;
          }
          case "error": {
            const errorEvent = event as { kind: "error"; data: unknown };
            error =
              typeof errorEvent.data === "string"
                ? errorEvent.data
                : "A2A communication error";
            resolve();
            break;
          }
          case "closed": {
            resolve();
            break;
          }
        }
      });
    });

    if (error && !responseText) {
      return `Error: ${error}`;
    }

    return responseText;
  }

  private isTerminalState(state: string | undefined): boolean {
    return (
      state === "completed" ||
      state === "failed" ||
      state === "canceled" ||
      state === "rejected"
    );
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
