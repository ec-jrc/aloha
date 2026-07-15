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
import {
  Collection,
  Db,
  Filter,
  ObjectId,
  OptionalUnlessRequiredId,
  WithId,
} from "mongodb";
import { Injector } from "typed-inject";
import {
  RepositoryRead,
  RepositoryWrite,
} from "../interfaces/repository-interfaces";

export type DatabaseProvider = { getDatabase: () => Db };

export class MongoDBGenericRepository<T extends { [k: string]: unknown }>
  implements RepositoryRead<T>, RepositoryWrite<T>
{
  private _collectionName: string;

  constructor(
    collectionName: string,
    protected injector: Injector<DatabaseProvider>
  ) {
    this._collectionName = collectionName;
  }

  public get collectionName() {
    return this._collectionName;
  }

  async findByPattern(item: Partial<T>): Promise<(T & schemas.WithIdBase)[]> {
    const filter = item as Filter<T>; // only find by example is valid
    const items = await this.getCollection().find(filter).toArray();
    return items
      .map((e) => this.mapIdField(e))
      .map((e) => this.transformOnRead(e));
  }

  async findById(id: string): Promise<(T & schemas.WithIdBase) | null> {
    const filter = {
      _id: new ObjectId(id),
    } as Filter<T>;

    const item = await this.getCollection().findOne(filter);
    if (item === null) {
      return null;
    }
    return this.transformOnRead(this.mapIdField(item));
  }

  async create(item: T): Promise<T & schemas.WithIdBase> {
    delete item._id;
    delete item.id;

    const result = await this.getCollection().insertOne(
      this.transformOnWrite(item) as OptionalUnlessRequiredId<T>
    );
    return { ...item, id: result.insertedId.toString() };
  }

  async updateById(id: string, item: Partial<T>): Promise<boolean> {
    delete item["id"];
    const setInstruction = { $set: this.transformOnWrite(item) };

    const result = await this.getCollection().updateOne(
      { _id: new ObjectId(id) } as Filter<T>,
      setInstruction
    );
    if (result.matchedCount === 0) {
      return false;
    }
    return true;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.getCollection().deleteOne({
      _id: new ObjectId(id) as Filter<T>,
    });
    return result.deletedCount > 0;
  }
  protected getCollection(): Collection<T> {
    return this.injector
      .resolve("getDatabase")()
      .collection<T>(this.collectionName);
  }

  protected transformOnRead(e: T & schemas.WithIdBase): T & schemas.WithIdBase {
    return e;
  }
  protected transformOnWrite(e: Partial<T>): Partial<T> {
    return { ...e };
  }

  protected mapIdField<U extends { [k: string]: unknown } = T>(
    item: WithId<U>
  ): U & schemas.WithIdBase {
    const result = { ...item, id: item._id.toString() } as U &
      schemas.WithIdBase;
    delete result._id;
    return result;
  }
}
