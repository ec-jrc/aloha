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

import { A2AAgentExecutionEvent } from "@/utils/a2a-event-transformer";
import { SendMessageRequest } from "@a2a-js/sdk";
import { endpoints_schemas, schemas } from "aloha-shared";
import { AgentDetail } from "node_modules/aloha-shared/dist/endpoints-schemas";
import { SSE } from "sse.js";
import z from "zod";
import {
  customFetch,
  safeParseWithErrors,
  setCreatorGenerator,
  setVisibilityGenerator,
} from "./utils";

const apiAgentUrl = "/api/agent";

export async function getAgentsListByConnectionId(connectionId: string) {
  const response = await customFetch(
    "Get agents list by connectionId",
    `${apiAgentUrl}/by_connection_id/${connectionId}`
  );
  const data: schemas.AgentWithId[] = await response.json();
  return data.map((agent) =>
    safeParseWithErrors(agent, schemas.AgentWithIdSchema)
  );
}
// Get all agents
export async function getAgentsList() {
  const response = await customFetch("Get agent list", apiAgentUrl);
  const data: endpoints_schemas.AgentListDetail[] = await response.json();
  // return safeParseWithErrors(data, endpoints_schemas.AgentListDetailSchema);
  return data.map((connection) =>
    safeParseWithErrors(connection, endpoints_schemas.AgentListDetailSchema)
  );
}

// Get agent details by ID
export async function getAgentDetail(id: string) {
  const response = await customFetch(
    "Get agent detail",
    `${apiAgentUrl}/${id}`
  );
  const data: endpoints_schemas.AgentDetail = await response.json();
  return safeParseWithErrors(data, endpoints_schemas.AgentDetailSchema);
}

// Create a new agent
export async function createAgent(agentData: endpoints_schemas.AgentCreate) {
  await customFetch("Create agent", apiAgentUrl, {
    method: "POST",
    body: JSON.stringify(agentData),
    headers: { "Content-Type": "application/json" },
  });
}

// Update agent by ID
export async function updateAgent(
  id: string,
  agentData: endpoints_schemas.AgentCreate
) {
  await customFetch("Update agent", `${apiAgentUrl}/${id}`, {
    method: "POST",
    body: JSON.stringify(agentData),
    headers: { "Content-Type": "application/json" },
  });
}

// Delete agent by ID
export async function deleteAgent(id: string) {
  await customFetch("Delete agent", `${apiAgentUrl}/${id}/_delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// Connect client to agent
export async function connectClientToAgent(agentId: string, clientId: string) {
  await customFetch(
    "Connect client to agent",
    `${apiAgentUrl}/${agentId}/_connect/${clientId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Disconnect client from agent
export async function disconnectClientFromAgent(
  agentId: string,
  clientId: string
) {
  await customFetch(
    "Disconnect client to agent",
    `${apiAgentUrl}/${agentId}/_disconnect/${clientId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Get the JWT token that should be used by the agent to connect to its mcp agent in ALOHA
export async function getAgentToken(agentId: string) {
  const response = await customFetch(
    "Get the token of an agent",
    `${apiAgentUrl}/${agentId}/_token`
  );
  const result: endpoints_schemas.JWTTokenResponse = await response.json();
  return safeParseWithErrors(result, endpoints_schemas.JWTTokenResponseSchema);
}

export const setAgentCreator = setCreatorGenerator(apiAgentUrl);
export const setAgentVisibility = setVisibilityGenerator(apiAgentUrl);

export async function cancelA2AStream(
  agentDetail: AgentDetail,
  taskId: string
) {
  const url = `${apiAgentUrl}/${agentDetail.id}/cancelTask`;
  await customFetch("cancelTask", url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
    }),
  });
}
export async function sendA2AMessageStream(
  agentDetail: AgentDetail,
  message: SendMessageRequest,
  callback: (
    event:
      | A2AAgentExecutionEvent
      | { kind: "error"; responseCode: number; data: unknown; final: true }
      | { kind: "closed"; final: true }
  ) => Promise<void>
): Promise<void> {
  const sse = new SSE(`${apiAgentUrl}/${agentDetail.id}/sendA2AMessageStream`, {
    headers: {
      "Content-Type": "application/json",
    },
    payload: JSON.stringify(message),
    // autoReconnect: true,
    // useLastEventId: true,
  });

  sse.addEventListener(
    `message`,
    async (event: { data: string; id: string; lastEventId: string }) => {
      const data = JSON.parse(event.data);
      console.log("Received stream message:", data);
      await callback(data);
    }
  );

  sse.addEventListener(
    "readystatechange",
    async (event: { readyState: number }) => {
      if (event.readyState === 2) {
        await callback({
          kind: "closed",
          final: true,
        });
      }
    }
  );

  sse.addEventListener(
    "error",
    async (event: { responseCode: number; data: unknown }) => {
      await callback({
        kind: "error",
        responseCode: event.responseCode,
        data: event.data,
        final: true,
      });
    }
  );

  sse.stream();
}

export function isA2AMessageSendParams(
  value: unknown
): value is SendMessageRequest {
  return (
    !!value &&
    typeof value === "object" &&
    "message" in value &&
    !!value.message &&
    typeof value.message === "object" &&
    "parts" in value.message &&
    Array.isArray(value.message.parts)
  );
}

export async function unregisterAgentWithIdentityPropagationService(
  id: string
) {
  await customFetch(
    "Unregistering with IDP server",
    `${apiAgentUrl}/${id}/unregisterWithIdentityPropagationService`,
    { method: "POST" }
  );
}

export async function registerAgentWithIdentityPropagationService(id: string) {
  await customFetch(
    "Registering with IDP server",
    `${apiAgentUrl}/${id}/registerWithIdentityPropagationService`,
    {
      method: "POST",
    }
  );
}

export async function isAgentRegisteredWithIdentityPropagationService(
  id: string
) {
  const response = await customFetch(
    "Get agent IDP registration status",
    `${apiAgentUrl}/${id}/isRegisteredInIdentityPropagationService`
  );
  const data = await response.json();
  return z.object({ registered: z.boolean().optional() }).parse(data);
}
