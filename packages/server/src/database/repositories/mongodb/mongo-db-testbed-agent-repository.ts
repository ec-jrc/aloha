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
import cloneDeep from "clone-deep";
import { ObjectId } from "mongodb";
import { Injector, INJECTOR_TOKEN } from "typed-inject";
import { decrypt, encrypt } from "../../../utils/crypto";
import { DatabaseProvider } from "./mongo-db-generic-repository";
import { MongoDBVisibilityRepository } from "./mongo-db-visibility-repository";
import { TestbedAgentRepository } from "../interfaces/testbed-agent-repository-interface";

export class MongoDbTestbedAgentRepository
  extends MongoDBVisibilityRepository<schemas.TestbedAgent>
  implements TestbedAgentRepository
{
  public static inject = ["serverSecret", INJECTOR_TOKEN] as const;
  constructor(
    private serverSecret: string,
    injector: Injector<DatabaseProvider>
  ) {
    super("testbed_agents", injector); // Collection name
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
  ): Promise<schemas.TestbedAgentWithId[]> {
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

  protected transform<T extends { client?: schemas.TestbedAgent["client"] }>(
    e: T,
    fun: (e: string, key: string) => string
  ): T {
    if (e.client) {
      e.client.apiKey = fun(e.client.apiKey, this.serverSecret);
    }
    return e;
  }

  protected transformOnRead(
    e: schemas.TestbedAgent & schemas.WithIdBase
  ): schemas.TestbedAgent & schemas.WithIdBase {
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
    e: Partial<schemas.TestbedAgent>
  ): Partial<schemas.TestbedAgent> {
    return this.transform(cloneDeep(e), encrypt);
  }
}
