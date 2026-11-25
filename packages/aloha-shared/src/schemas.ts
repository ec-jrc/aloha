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

export const WithIdBaseSchema = z.object({
  id: z.string().min(1, "Empty ID is not allowed"),
});
export type WithIdBase = z.infer<typeof WithIdBaseSchema>;

export const TagSchema = z
  .string()
  .min(3, "Tag needs to be at least 3 letters");
export type Tag = z.infer<typeof TagSchema>;

export const WithTagsSchema = z.object({
  tags: z.array(TagSchema).optional(),
});

export const AuthenticationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),

  z.object({
    type: z.literal("basic"),
    username: z.string().min(1, "Username cannot be blank"),
    password: z.string().min(1, "Password cannot be blank"),
  }),

  z.object({
    type: z.literal("token"),
    token: z.string().min(1, "Token cannot be blank"),
  }),

  z.object({
    type: z.literal("oidc_client_secret"),
    clientId: z.string().min(1, "OIDC Client Id cannot be blank"),
    clientSecret: z.string().optional(),
  }),
]);
export type Authentication = z.infer<typeof AuthenticationSchema>;

export enum Visibility {
  Public = "public",
  Private = "private",
  Managed = "managed",
}

export const VisibilitySchema = z.object({
  creator: z.string(),

  disabled: z.boolean().optional(),
  visibility: z.nativeEnum(Visibility), //.default(Visibility.Private),
  projects: z.array(z.string()).optional(),
});
export type VisibilityInterface = z.infer<typeof VisibilitySchema>;

export const VersioningInfoSchema = z.object({
  versionNumber: z.number().min(1),
  versionGroupingUUID: z.string().min(1),
});

export type VersioningInfo = z.infer<typeof VersioningInfoSchema>;

export const ObjectWithExtrasSchema = z.object({
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type ObjectWithExtras = z.infer<typeof ObjectWithExtrasSchema>;

export const AllowedHttpHeaderSchema = z.object({
  value: z.string(),
  override: z.boolean().default(false),
});
export type AllowedHttpHeader = z.infer<typeof AllowedHttpHeaderSchema>;

export const MCPBaseConnectionSchema = VisibilitySchema.merge(
  z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    serverUrl: z.string().min(1, "Server URL is required"),
    serverProtocol: z.enum(["http", "sse", "websocket"], {
      error: "Server protocol must be 'http', 'sse' or 'websocket'",
    }),
    authentication: AuthenticationSchema.optional(),
    allowedHttpHeaders: z
      .record(z.string().min(1), AllowedHttpHeaderSchema)
      .optional(),
    type: z.string(),
    lastOnlineAt: z.coerce.date().optional(),
    lastOfflineAt: z.coerce.date().optional(),
    versioningInfo: VersioningInfoSchema.optional(),
  })
).merge(ObjectWithExtrasSchema);

export type MCPBaseConnection = z.infer<typeof MCPBaseConnectionSchema>;

export const MCPBaseConnectionWithIdSchema = WithIdBaseSchema.and(
  MCPBaseConnectionSchema
);
export type MCPBaseConnectionWithId = z.infer<
  typeof MCPBaseConnectionWithIdSchema
>;

export const MCPConnectionOptionsSchema = MCPBaseConnectionSchema.merge(
  WithTagsSchema
).merge(
  z.object({
    type: z.literal("client"),
  })
);
export type MCPConnectionOptions = z.infer<typeof MCPConnectionOptionsSchema>;

export const MCPConnectionOptionsWithIdSchema = WithIdBaseSchema.and(
  MCPConnectionOptionsSchema
);
export type MCPConnectionOptionsWithId = z.infer<
  typeof MCPConnectionOptionsWithIdSchema
>;

export const MCPConnectionCreationEvent = z.object({
  type: z.string(),
  content: z.any(),
});

export const MCPBaseServerSchema = VisibilitySchema.merge(
  z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    serverPath: z
      .string()
      .min(1, "Server path is required")
      .max(20, "Server path is too long")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Server path can only include letters, numbers and special characters - _"
      ),
    connections: z
      .array(z.string().min(1, "Connection id is required"))
      .optional(),
    type: z.string(),
  })
);
export type MCPBaseServer = z.infer<typeof MCPBaseServerSchema>;

export const MCPBaseServerWithIdSchema =
  WithIdBaseSchema.and(MCPBaseServerSchema);
export type MCPBaseServerWithId = z.infer<typeof MCPBaseServerWithIdSchema>;

export const MCPServerOptionsSchema = MCPBaseServerSchema.merge(
  WithTagsSchema
).merge(
  z.object({
    type: z.literal("server"),
  })
);
export type MCPServerOptions = z.infer<typeof MCPServerOptionsSchema>;

export const MCPServerOptionsWithIdSchema = WithIdBaseSchema.and(
  MCPServerOptionsSchema
);
export type MCPServerOptionsWithId = z.infer<
  typeof MCPServerOptionsWithIdSchema
>;

export const AgentSchema = MCPBaseConnectionSchema.merge(MCPBaseServerSchema)
  .merge(WithTagsSchema)
  .merge(
    z.object({
      type: z.literal("agent"),
      serverProtocol: z.enum(["http", "sse", "a2a"]),
    })
  );
export type Agent = z.infer<typeof AgentSchema>;

export const AgentWithIdSchema = WithIdBaseSchema.and(AgentSchema);
export type AgentWithId = z.infer<typeof AgentWithIdSchema>;

// const LLMConnection = z.object({
//   endpointType: z.enum(["openai", "ollama"]),
//   endpointUrl: z.string(),
//   apiKey: z.string(),
//   model: z.string(),
//   temperature: z.optional(z.number()),
//   maxTokens: z.optional(z.number()),
//   topP: z.optional(z.number()),
// });

export const UserSchema = z.object({
  userId: z
    .string()
    .min(7, "User ID length must be longer or equal to 7 characters"),
  fullName: z.string(),
  permissions: z.array(z.string()),
  disabled: z.boolean().optional(),
  projects: z.array(z.string()).optional(),
});

export type User = z.infer<typeof UserSchema>;

export const UserWithIdSchema = WithIdBaseSchema.and(UserSchema);
export type UserWithId = z.infer<typeof UserWithIdSchema>;

export const ProjectSchema = z.object({
  projectId: z
    .string()
    .min(3, "Project ID should have a length greater than 3 characters"),
  name: z
    .string()
    .min(3, "Project name should have a length greater than 3 characters"),

  description: z.string(),
  tags: z.array(TagSchema).optional(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectWithIdSchema = WithIdBaseSchema.and(ProjectSchema);
export type ProjectWithId = z.infer<typeof ProjectWithIdSchema>;

export const JWTTokenSchema = z.object({
  userId: z.string(),
  projectId: z.string(),
  permissions: z.array(z.string()),
  expirationDate: z.date(),
  disabled: z.boolean(),
});

export type JWTToken = z.infer<typeof JWTTokenSchema>;

export const JWTTokenWithIdSchema = WithIdBaseSchema.and(JWTTokenSchema);
export type JWTTokenWithId = z.infer<typeof JWTTokenWithIdSchema>;

export const TestbedAgentSchema = VisibilitySchema.merge(
  z.object({
    client: z.object({
      apiKey: z.string().min(1, "API key is required"),
      baseURL: z.string().min(1, "BaseURL is required"),
    }),
    useChatCompletions: z.boolean(),
    model: z.string().min(1, "Model Name is required"),
    prompt: z.string().min(1, "Prompt is required"),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    connections: z
      .array(z.string().min(1, "Connection id is required"))
      .optional(),
    type: z.literal("testbed_agent"),
  })
);
export type TestbedAgent = z.infer<typeof TestbedAgentSchema>;

export const TestbedAgentWithIdSchema =
  WithIdBaseSchema.and(TestbedAgentSchema);

export type TestbedAgentWithId = z.infer<typeof TestbedAgentWithIdSchema>;
