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

import { schemas } from "aloha-shared";
import cloneDeep from "clone-deep";
import { Injector, INJECTOR_TOKEN } from "typed-inject";
import { decrypt, encrypt } from "../../../utils/crypto.js";
import { AgentRepository } from "../interfaces/agent-repository-interface.js";
import { DatabaseProvider } from "./postgres-generic-repository.js";
import { JunctionHelper } from "./junction-helper.js";
import { PostgreSQLVisibilityRepository } from "./postgres-visibility-repository.js";

export class PostgreSQLAgentRepository
  extends PostgreSQLVisibilityRepository<schemas.Agent>
  implements AgentRepository
{
  public static inject = ["serverSecret", INJECTOR_TOKEN] as const;
  constructor(
    private serverSecret: string,
    injector: Injector<DatabaseProvider>
  ) {
    super("agents", injector);
    this.junctions.connections = new JunctionHelper(
      this.getPool(),
      "agent_to_clients",
      "agentId",
      "clientId"
    );
    this.junctions.projects = new JunctionHelper(
      this.getPool(),
      "agent_to_projects",
      "agentId",
      "projectId"
    );
  }

  async addNewConnection(id: string, connectionId: string): Promise<boolean> {
    return this.junctions.connections.add(id, connectionId);
  }

  async replaceConnections(
    id: string,
    connections: string[]
  ): Promise<boolean> {
    await this.junctions.connections.replaceAll(id, connections);
    return true;
  }

  async findByConnectionId(
    connectionId: string
  ): Promise<schemas.AgentWithId[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(
        `SELECT a.* FROM agents a
         INNER JOIN agent_to_clients ac ON a.id = ac."agentId"
         WHERE ac."clientId" = $1`,
        [connectionId]
      );
      return result.rows.map((row: Record<string, unknown>) =>
        this.mapRowToEntity(row)
      );
    } finally {
      client.release();
    }
  }

  async unsetCreator(id: string): Promise<boolean> {
    const client = await this.getClient();
    try {
      const result = await client.query(
        `UPDATE agents SET creator = NULL WHERE id = $1`,
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  private transformAuth<
    T extends { authentication?: schemas.Authentication },
  >(e: T, fun: (v: string, key: string) => string): T {
    if (e.authentication) {
      switch (e.authentication.type) {
        case "none":
          break;
        case "basic":
          e.authentication.password = fun(
            e.authentication.password,
            this.serverSecret
          );
          e.authentication.username = fun(
            e.authentication.username,
            this.serverSecret
          );
          break;
        case "token":
          e.authentication.token = fun(
            e.authentication.token,
            this.serverSecret
          );
          break;
        case "oidc_client_secret":
          e.authentication.clientId = fun(
            e.authentication.clientId,
            this.serverSecret
          );
          if (e.authentication.clientSecret) {
            e.authentication.clientSecret = fun(
              e.authentication.clientSecret,
              this.serverSecret
            );
          }
          break;
      }
    }
    return e;
  }

  protected transformOnRead(
    e: schemas.Agent & schemas.WithIdBase
  ): schemas.Agent & schemas.WithIdBase {
    return this.transformAuth(e, (v, key) => {
      try {
        return decrypt(v, key);
      } catch {
        return v;
      }
    });
  }

  protected transformOnWrite(
    e: Partial<schemas.Agent>
  ): Partial<schemas.Agent> {
    return this.transformAuth(cloneDeep(e), encrypt);
  }
}
