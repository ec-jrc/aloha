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
import { DatabaseProvider } from "./mongo-db-generic-repository";
import { AgentRepository } from "../interfaces/agent-repository-interface";
import { Injector, INJECTOR_TOKEN } from "typed-inject";
import { ObjectId } from "mongodb";
import { MongoDBVisibilityRepository } from "./mongo-db-visibility-repository";
import cloneDeep from "clone-deep";
import { decrypt, encrypt } from "../../../utils/crypto";

export class MongoDbAgentRepository
  extends MongoDBVisibilityRepository<schemas.Agent>
  implements AgentRepository
{
  public static inject = ["serverSecret", INJECTOR_TOKEN] as const;
  constructor(
    private serverSecret: string,
    injector: Injector<DatabaseProvider>
  ) {
    super("agents", injector); // Collection name
  }

  public async addNewConnection(
    id: string,
    connectionId: string
  ): Promise<boolean> {
    const result = await this.getCollection().updateOne(
      {
        _id: new ObjectId(id),
      },
      { $push: { connections: connectionId } }
    );
    return result.modifiedCount > 0;
  }

  public async replaceConnections(id: string, connections: string[]) {
    const result = await this.getCollection().updateOne(
      { _id: new ObjectId(id) },
      { $set: { connections: connections } }
    );

    return result.modifiedCount > 0;
  }

  public async findByConnectionId(
    connectionId: string
  ): Promise<schemas.AgentWithId[]> {
    const result = await this.getCollection()
      .find({
        connections: { $in: [connectionId] },
      })
      .toArray();
    return result
      .map((e) => this.mapIdField(e))
      .map((e) => this.transformOnRead(e));
  }
  public async unsetCreator(id: string): Promise<boolean> {
    const result = await this.getCollection().updateOne(
      { _id: new ObjectId(id) },
      { $unset: { creator: true } }
    );

    return result.modifiedCount > 0;
  }

  protected transform<T extends { authentication?: schemas.Authentication }>(
    e: T,
    fun: (e: string, key: string) => string
  ): T {
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
    return this.transform(e, (v, key) => {
      try {
        return decrypt(v, key);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        return v;
      }
    });
  }
  protected transformOnWrite(
    e: Partial<schemas.Agent>
  ): Partial<schemas.Agent> {
    return this.transform(cloneDeep(e), encrypt);
  }
}
