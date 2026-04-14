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
import { Observable, catchError, map, throwError } from "rxjs";
import { SSE, ReadyStateEvent, SSEvent } from "sse.js";
import {
  customFetch,
  safeParseWithErrors,
  setCreatorGenerator,
  setVisibilityGenerator,
} from "./utils";
import { ClientRequest } from "@modelcontextprotocol/sdk/types.js";
import z from "zod";
const apiClientsUrl = "/api/client";
// const apiServersUrl = "/api/server"

export async function getConnectionList() {
  const response = await customFetch("Get clients list", `${apiClientsUrl}/`);
  const data: endpoints_schemas.MCPConnectionsList = await response.json();
  return data.map((connection) =>
    safeParseWithErrors(connection, endpoints_schemas.MCPConnectionStatusSchema)
  );
}

export async function unregisterWithIdentityPropagationService(id: string) {
  await customFetch(
    "Unregistering with IDP server",
    `${apiClientsUrl}/${id}/unregisterWithIdentityPropagationService`,
    { method: "POST" }
  );
}

export async function registerWithIdentityPropagationService(id: string) {
  await customFetch(
    "Registering with IDP server",
    `${apiClientsUrl}/${id}/registerWithIdentityPropagationService`,
    {
      method: "POST",
    }
  );
}

export async function isConnectionRegisteredWithIdentityPropagationService(
  id: string
) {
  const response = await customFetch(
    "Get client IDP registration status",
    `${apiClientsUrl}/${id}/isRegisteredInIdentityPropagationService`
  );
  const data = await response.json();
  return z.object({ registered: z.boolean() }).parse(data);
}

export async function getConnectionDetail(id: string) {
  const response = await customFetch(
    "Get client detail",
    `${apiClientsUrl}/${id}`
  );
  const data = await response.json();
  return safeParseWithErrors<endpoints_schemas.MCPConnectionDetail>(
    data,
    endpoints_schemas.MCPConnectionDetailSchema
  );
}

interface ServerSideEvent {
  type: string;
  content: unknown;
}

function sseObservable(source: SSE) {
  return new Observable<string>((subscriber) => {
    const messageFunction = (e: SSEvent) => {
      subscriber.next(e.data);
    };
    const errorFunction = (e: SSEvent) => {
      subscriber.error(e.data);
    };

    source.addEventListener("message", messageFunction);
    source.addEventListener("error", errorFunction);
    source.addEventListener("readystatechange", (e: ReadyStateEvent) => {
      if (e.readyState && e.readyState == SSE.CLOSED) {
        subscriber.complete();
      }
    });

    return () => {
      source.removeEventListener("message", messageFunction);
      source.removeEventListener("error", errorFunction);
      if (source.readyState === 1) {
        source.close();
      }
    };
  });
}

export function createConnection(
  connectionOptions: endpoints_schemas.MCPConnectionOptionsCreate
): Observable<ServerSideEvent | undefined> {
  const source = new SSE(apiClientsUrl, {
    method: "POST",
    payload: JSON.stringify(connectionOptions),
    withCredentials: false,
    debug: false,
    headers: {
      "Content-type": "application/json",
    },
    // start: false,
  });

  return sseObservable(source).pipe(
    map((data) => {
      const parser = schemas.MCPConnectionCreationEvent.safeParse(
        JSON.parse(data)
      );
      if (parser.success) {
        return {
          type: parser.data.type,
          content: parser.data.content,
        };
      }
    }),
    catchError((error) => {
      return throwError(() => JSON.parse(error));
    })
  );
}

export async function editConnection(
  id: string,
  connectionOptions: endpoints_schemas.MCPConnectionOptionsCreate &
    Partial<Pick<schemas.VisibilityInterface, "visibility">>
) {
  await customFetch("Edit connection", `${apiClientsUrl}/${id}`, {
    method: "POST",
    body: JSON.stringify(connectionOptions),
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteConnection(id: string) {
  await customFetch("Delete connection", `${apiClientsUrl}/${id}/_delete`, {
    method: "POST",
    body: "",
    headers: { "Content-Type": "application/json" },
  });
}

export async function sendMCPClientRequest<T extends z.ZodType>(
  id: string,
  request: ClientRequest,
  schema: T
): Promise<{ response: z.output<T>; newSessionCreated: boolean | undefined }> {
  const response = await customFetch(
    "Send MCP Request to client",
    `${apiClientsUrl}/${id}/sendMCPClientRequest`,
    {
      method: "POST",
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
    }
  );
  const result: {
    response: z.output<T>;
    newSessionCreated: boolean | undefined;
  } = await response.json();
  schema.parse(result.response);
  return result;
}

export const setConnectionCreator = setCreatorGenerator(apiClientsUrl);
export const setConnectionVisibility = setVisibilityGenerator(apiClientsUrl);
