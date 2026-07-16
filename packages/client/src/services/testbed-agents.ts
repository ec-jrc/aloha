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

import { endpoints_schemas, schemas } from "aloha-shared";
import {
  customFetch,
  isWithErrorsObject,
  safeParseWithErrors,
  setCreatorGenerator,
  setVisibilityGenerator,
} from "./utils";

import {
  Agent,
  AgentInputItem,
  OpenAIProvider,
  Runner,
  RunStreamEvent,
  RunToolCallItem,
  RunToolCallOutputItem,
  StreamEventResponseCompleted,
} from "@openai/agents";
import { APIUserAbortError, OpenAI } from "openai";
import { ModelsPage } from "openai/resources/models";
import { getAgentsList } from "./agents";
import { getConnectionList } from "./clients";
import {
  AlohaMCPServer,
  AlohaA2AAgentMCPServer,
  AlohaTestbedAgentMCPServer,
} from "./mcp-tool-adapters";

const apiAgentUrl = "/api/testbedAgent";
const apiAgentUrlProxy = "/api/testbedAgentProxy";

export type AgentInstanceEventCallback = (
  agentInstance: AgentInstance,
  lastEvent: RunStreamEvent
) => void;

export type GenericConnection = {
  name: string;
  isConnected: boolean;
  id: string;
  type: "client" | "agent" | "testbedAgent";
  versioningInfo?: {
    versionNumber: number;
    versionGroupingUUID: string;
  };
};

export async function getModelsForEndpoint(
  agentConfig: schemas.TestbedAgentWithId
): Promise<ModelsPage> {
  const response = await customFetch(
    "Get models for endpoint",
    `${apiAgentUrlProxy}/${agentConfig.id}/models`
  );
  const data = await response.json();
  return data;
}

export async function getTestbedAgentsListByConnectionId(connectionId: string) {
  const response = await customFetch(
    "Get testbed agents list by connectionId",
    `${apiAgentUrl}/by_connection_id/${connectionId}`
  );
  const data: schemas.TestbedAgentWithId[] = await response.json();
  return data.map((agent) =>
    safeParseWithErrors(agent, schemas.TestbedAgentWithIdSchema)
  );
}

export async function getTestbedAgentsList() {
  const response = await customFetch("Get testbed agent list", apiAgentUrl);
  const data: schemas.TestbedAgentWithId[] = await response.json();
  return data.map((connection) =>
    safeParseWithErrors(connection, schemas.TestbedAgentWithIdSchema)
  );
}

// Get agent details by ID
export async function getTestbedAgentDetail(id: string) {
  const response = await customFetch(
    "Get agent detail",
    `${apiAgentUrl}/${id}`
  );
  const data = await response.json();
  return safeParseWithErrors(
    data,
    endpoints_schemas.TestbedAgentWithIdAndDetailSchema
  );
}

// Create a new agent
export async function createTestbedAgent(agentData: schemas.TestbedAgent) {
  await customFetch("Create agent", apiAgentUrl, {
    method: "POST",
    body: JSON.stringify(agentData),
    headers: { "Content-Type": "application/json" },
  });
}

// Update agent by ID
export async function updateTestbedAgent(
  id: string,
  agentData: schemas.TestbedAgent
) {
  await customFetch("Update agent", `${apiAgentUrl}/${id}`, {
    method: "POST",
    body: JSON.stringify(agentData),
    headers: { "Content-Type": "application/json" },
  });
}

// Delete agent by ID
export async function deleteTestbedAgent(id: string) {
  await customFetch("Delete testbed agent", `${apiAgentUrl}/${id}/_delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// Connect client to agent
export async function connectClientToTestbedAgent(
  agentId: string,
  clientId: string
) {
  await customFetch(
    "Connect client to testbed agent",
    `${apiAgentUrl}/${agentId}/_connect/${clientId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Disconnect client from agent
export async function disconnectClientFromTestbedAgent(
  agentId: string,
  clientId: string
) {
  await customFetch(
    "Disconnect client to testbed agent",
    `${apiAgentUrl}/${agentId}/_disconnect/${clientId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
}

export const setTestbedAgentCreator = setCreatorGenerator(apiAgentUrl);
export const setTestbedAgentVisibility = setVisibilityGenerator(apiAgentUrl);

export interface AgentInstance {
  agentDetail: endpoints_schemas.TestbedAgentWithIdAndDetail;
  agent: Agent;
  runner: Runner;
  abortController: AbortController;
  messages: AgentInputItem[];
  events: RunStreamEvent[];
  eventCallback: AgentInstanceEventCallback;
}

export async function createAgentInstance(
  agentDetail: endpoints_schemas.TestbedAgentWithIdAndDetail,
  eventCallback: AgentInstanceEventCallback,
  abortController: AbortController = new AbortController()
) {
  console.log(`Allocating TestBed agent ${agentDetail.name}...`);

  const tools = agentDetail.connectionsDetail
    .filter((e) => e.isConnected)
    .map((e) => {
      switch (e.type) {
        case "client":
          return new AlohaMCPServer(e.id, e.name, e.type);
        case "agent":
          if (e.serverProtocol === "a2a") {
            return new AlohaA2AAgentMCPServer(e.id, e.name);
          }
          return new AlohaMCPServer(e.id, e.name, e.type);
        case "testbedAgent":
          return new AlohaTestbedAgentMCPServer(
            e.id,
            e.name,
            eventCallback,
            abortController
          );
        default:
          throw new Error(`Unsupported connection type: ${e.type}`);
      }
    });

  tools.forEach((e) => {
    console.log("Tool: " + e.name);
  });

  const agent = new Agent({
    name: agentDetail.name,
    instructions: agentDetail.prompt,
    model: agentDetail.model,
    mcpServers: tools,
  });

  const location = window.location;
  const proxyUrl = `${location.protocol}//${location.host}${apiAgentUrlProxy}/${agentDetail.id}`;
  console.log("Testbed Agent proxy url", proxyUrl);

  const client = new OpenAI({
    dangerouslyAllowBrowser: true,
    apiKey: agentDetail.client.apiKey,
    baseURL: proxyUrl,
  });

  const modelProvider = new OpenAIProvider({
    openAIClient: client,
    useResponses: !agentDetail.useChatCompletions,
  });
  const runner = new Runner({ modelProvider, tracingDisabled: true });
  return {
    agentDetail,
    agent,
    runner,
    messages: [],
    events: [],
    abortController,
    eventCallback,
  } as AgentInstance;
}

export function stopAgentInstanceRun(agentInstance: AgentInstance) {
  if (!agentInstance) {
    return;
  }

  agentInstance.abortController.abort();
  agentInstance.abortController = new AbortController();
}

export async function sendMessageToAgentInstance(
  agentInstance: AgentInstance,
  message: string
) {
  console.log("Send message", message);
  const { agent, runner, messages } = agentInstance;
  const servers = agent.mcpServers;
  try {
    agentInstance.eventCallback(agentInstance, {
      agent: agentInstance.agent,
      type: "agent_updated_stream_event",
    });

    await Promise.all(
      servers.map(async (e) => {
        console.log("Connecting", e.name);
        await e.connect();
      })
    );

    const result = await runner.run(
      agent,
      messages.concat({ role: "user", content: message, type: "message" }),
      { stream: true, signal: agentInstance.abortController.signal }
    );
    for await (const event of result) {
      agentInstance.events = [...agentInstance.events, event];
      agentInstance.eventCallback(agentInstance, event);
    }

    agentInstance.messages = result.history;

    console.log("History", agentInstance.messages);
    return result.finalOutput;
  } catch (err) {
    if (err instanceof APIUserAbortError) {
      console.log("Run aborted by the user");
    } else {
      throw err;
    }
  } finally {
    await Promise.all(servers.map((e) => e.close()));
  }
}

export type AgentInstaceMergedEvent = {
  id: string;
  agentName: string;
} & (
  | { type: "llm_response_started" }
  | { type: "llm_response_done"; content: StreamEventResponseCompleted }
  | { type: "llm_response_in_progress"; progress: string }
  | { type: "tool_call_request"; content: RunToolCallItem }
  | { type: "tool_call_output"; content: RunToolCallOutputItem }
  | { type: "system_prompt"; content: string }
  | { type: "user_message"; content: string }
  | { type: "error_message"; content: unknown }
  | { type: "agent_updated" }
);

export type AgentInstanceEvent = {
  type: "agent_instance_event";
  agentInstance: AgentInstance;
  event: RunStreamEvent;
};

export type SystemMessageEvent = {
  type: "system_prompt";
  content: string;
};

export type UserMessageEvent = {
  type: "user_message";
  content: string;
};

export type ErrorMessageEvent = {
  type: "error_message";
  content: unknown;
};

export type CustomAgentEvent = {
  type: "custom_agent_event";
  agentInstance: AgentInstance;
  event: UserMessageEvent | ErrorMessageEvent | SystemMessageEvent;
};

export function agentInstanceMergeEvents(
  events: (AgentInstanceEvent | CustomAgentEvent)[]
) {
  const result: Array<AgentInstaceMergedEvent> = [];

  let outputTextDeltaAccumulator: string | null = null;

  events.forEach((agentEvent, idx) => {
    if (agentEvent.type === "custom_agent_event") {
      if (agentEvent.event.type === "user_message") {
        result.push({
          agentName: "",
          content: agentEvent.event.content,
          id: `caem-${idx}`,
          type: "user_message",
        });
      } else if (agentEvent.event.type === "error_message") {
        result.push({
          agentName: agentEvent.agentInstance.agent.name,
          content: agentEvent.event.content,
          id: `caee-${idx}`,
          type: "error_message",
        });
      } else if (agentEvent.event.type === "system_prompt") {
        result.push({
          agentName: agentEvent.agentInstance.agent.name,
          content: agentEvent.event.content,
          id: `caes-${idx}`,
          type: "system_prompt",
        });
      } else {
        throw Error(
          `Invalid custom_agent_event: ` + JSON.stringify(agentEvent)
        );
      }

      return;
    }
    const event = agentEvent.event;

    if (event.type === "raw_model_stream_event") {
      if (event.data.type === "response_started") {
        result.push({
          agentName: agentEvent.agentInstance.agentDetail.name,
          type: "llm_response_started",
          id: event.data.providerData?.id || `rs-${idx}`,
        });
      } else if (event.data.type === "output_text_delta") {
        if (outputTextDeltaAccumulator === null) {
          outputTextDeltaAccumulator = event.data.delta;
        } else {
          outputTextDeltaAccumulator += event.data.delta;
        }
      } else if (event.data.type === "response_done") {
        if (outputTextDeltaAccumulator !== null) {
          outputTextDeltaAccumulator = null;
        }
        result.push({
          agentName: agentEvent.agentInstance.agentDetail.name,
          content: event.data,
          type: "llm_response_done",
          id: `rd-${idx}`,
        });
      }
    } else if (event.type === "run_item_stream_event") {
      if (
        event.name === "tool_called" &&
        event.item.type === "tool_call_item"
      ) {
        result.push({
          agentName: agentEvent.agentInstance.agentDetail.name,
          content: event.item,
          type: "tool_call_request",
          id: `tcr-${idx}`,
        });
      } else if (
        event.name === "tool_output" &&
        event.item.type === "tool_call_output_item"
      ) {
        result.push({
          agentName: agentEvent.agentInstance.agentDetail.name,
          content: event.item,
          type: "tool_call_output",
          id: `tco-${idx}`,
        });
      }
    } else if (event.type === "agent_updated_stream_event") {
      result.push({
        agentName: event.agent.name,
        id: `au-${idx}`,
        type: "agent_updated",
      });
    } else {
      console.log("Unsupported event", event);
    }
  });

  if (outputTextDeltaAccumulator !== null) {
    const lastEvent = events[events.length - 1];
    if (typeof lastEvent !== "string") {
      result.push({
        agentName: lastEvent.agentInstance.agentDetail.name,
        progress: outputTextDeltaAccumulator,
        type: "llm_response_in_progress",
        id: `otdf-${result.length}`,
      });
      outputTextDeltaAccumulator = null;
    }
  }

  return result;
}

export async function getConnectionListAsGenericConnection() {
  const connections = await getConnectionList();
  return connections
    .filter((e) => !isWithErrorsObject(e))
    .map(
      (e) =>
        ({
          type: "client",
          name: e.name,
          id: e.id,
          isConnected: e.isConnected || false,
          versioningInfo: e.versioningInfo,
        }) as GenericConnection
    );
}

export async function getAllAgentsAsGenericConnection() {
  const agents = await getAgentsList();
  return agents
    .filter((e) => !isWithErrorsObject(e))
    .map(
      (e) =>
        ({
          type: "agent",
          id: e.id,
          name: e.name,
          isConnected: e.isConnected,
        }) as GenericConnection
    );
}
export async function getAllTestbedAgentsAsGenericConnection() {
  const agents = await getTestbedAgentsList();
  return agents
    .filter((e) => !isWithErrorsObject(e))
    .map(
      (e) =>
        ({
          type: "testbedAgent",
          id: e.id,
          name: e.name,
          isConnected: true,
        }) as GenericConnection
    );
}
export async function getAllGenericConnections(
  self: string | undefined,
  connections: boolean,
  agents: boolean,
  testbedAgents: boolean
) {
  const promises = [];
  if (connections) {
    promises.push(getConnectionListAsGenericConnection());
  }
  if (agents) {
    promises.push(getAllAgentsAsGenericConnection());
  }
  if (testbedAgents) {
    promises.push(getAllTestbedAgentsAsGenericConnection());
  }
  const allConnections = await Promise.all(promises);
  return allConnections.flatMap((e) => e).filter((e) => e.id !== self);
}
