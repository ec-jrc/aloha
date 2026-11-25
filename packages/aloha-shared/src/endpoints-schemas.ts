import { PromptSchema, ResourceSchema, ResourceTemplateSchema, ToolSchema } from "@modelcontextprotocol/core";

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
import { z } from "zod";
import {
  MCPConnectionOptionsWithIdSchema,
  MCPServerOptionsSchema,
  MCPServerOptionsWithIdSchema,
  MCPConnectionOptionsSchema,
  AgentWithIdSchema,
  AgentSchema,
  TestbedAgentWithIdSchema,
  VersioningInfoSchema,
} from "./schemas.js";

export const ResponseError = z.object({
  error: z.string(),
});

export const MCPConnectionStatusSchema = MCPConnectionOptionsWithIdSchema.and(
  z.object({
    isStateful: z.boolean().optional(),
    isConnected: z.boolean(),
    resources: z.number(),
    resourceTemplates: z.number(),
    prompts: z.number(),
    tools: z.number(),
  })
);
export type MCPConnectionStatus = z.infer<typeof MCPConnectionStatusSchema>;

export const MCPConnectionsListSchema = z.array(MCPConnectionStatusSchema);
export type MCPConnectionsList = z.infer<typeof MCPConnectionsListSchema>;

export const MCPConnectionDetailSchema = MCPConnectionOptionsWithIdSchema.and(
  z.object({
    isStateful: z.boolean().optional(),
    isConnected: z.boolean(),
    resources: z.array(ResourceSchema),
    resourceTemplates: z.array(ResourceTemplateSchema),
    prompts: z.array(PromptSchema),
    tools: z.array(ToolSchema),
  })
);

export type MCPConnectionDetail = z.infer<typeof MCPConnectionDetailSchema>;

export const MCPConnectionCreationEventSchema = z.object({
  description: z.string(),
  connectionId: z.string(),
});

export const MCPConnectionOptionsCreateSchema = MCPConnectionOptionsSchema.omit(
  {
    creator: true,
    visibility: true,
  }
);
export type MCPConnectionOptionsCreate = z.infer<
  typeof MCPConnectionOptionsCreateSchema
>;

// export const MCPConnectionOptionsEditSchema =
//   MCPConnectionOptionsCreateSchema.omit({
//     serverUrl: true,
//   });
// export type MCPConnectionOptionsEdit = z.infer<
//   typeof MCPConnectionOptionsEditSchema
// >;

export const MCPServerOptionsListSchema = z.array(MCPServerOptionsWithIdSchema);
export type MCPServerOptionsList = z.infer<typeof MCPServerOptionsListSchema>;
export const MCPServerOptionsDetailSchema = MCPServerOptionsWithIdSchema.and(
  z.object({
    connectionsDetail: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          isConnected: z.boolean().optional(),
          type: z.string(),
          versioningInfo: VersioningInfoSchema.optional(),
        })
      )
      .optional(),
  })
);

export type MCPServerOptionsDetail = z.infer<
  typeof MCPServerOptionsDetailSchema
>;

export const MCPServerOptionsCreateSchema = MCPServerOptionsSchema.omit({
  creator: true,
});
export type MCPServerOptionsCreate = z.infer<
  typeof MCPServerOptionsCreateSchema
>;

export const AgentListDetailSchema = AgentWithIdSchema.and(
  z.object({
    isConnected: z.boolean(),
    tools: z.number(),
  })
);
export type AgentListDetail = z.infer<typeof AgentListDetailSchema>;

export const AgentDetailSchema = AgentWithIdSchema.and(
  z.object({
    isConnected: z.boolean(),
    tools: z.array(ToolSchema).optional(),
    connectionsDetail: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          isConnected: z.boolean().optional(),
          type: z.string(),
          versioningInfo: VersioningInfoSchema.optional(),
        })
      )
      .optional(),
    metadata: z.record(z.string(), z.unknown()),
  })
);
export type AgentDetail = z.infer<typeof AgentDetailSchema>;

export const AgentCreateSchema = AgentSchema.omit({
  creator: true,
  visibility: true,
});
export type AgentCreate = z.infer<typeof AgentCreateSchema>;

export const JWTTokenRequestSchema = z.object({
  project: z.string(),
  expirationDate: z.string(),
});
export type JWTTokenRequest = z.infer<typeof JWTTokenRequestSchema>;

export const JWTTokenResponseSchema = z.object({
  token: z.string(),
});

export type JWTTokenResponse = z.infer<typeof JWTTokenResponseSchema>;

export const AllowedHttpHeadersOverridesSchema = z.object({
  allowedHttpHeadersOverrides: z.array(z.string()),
});
export type AllowedHttpHeadersOverrides = z.infer<
  typeof AllowedHttpHeadersOverridesSchema
>;

export const HubStatusSchema = z.object({
  clients: z.object({
    online: z.number(),
    total: z.number(),
  }),
  agents: z.object({
    online: z.number(),
    total: z.number(),
  }),
  servers: z.object({
    online: z.number(),
    total: z.number(),
  }),
  startDate: z.coerce.date(),
  manager: z.object({
    startDate: z.coerce.date().nullable(),
  }),
});
export type HubStatus = z.infer<typeof HubStatusSchema>;

export const TestbedAgentWithIdAndDetailSchema = TestbedAgentWithIdSchema.and(
  z.object({
    connectionsDetail: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        isConnected: z.boolean(),
        type: z.enum(["agent", "client", "testbedAgent"]),
        serverProtocol: z.enum(["http", "sse", "a2a"]).optional(),
        versioningInfo: VersioningInfoSchema.optional(),
      })
    ),
  })
);
export type TestbedAgentWithIdAndDetail = z.infer<
  typeof TestbedAgentWithIdAndDetailSchema
>;
