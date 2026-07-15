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
import { Pool, PoolClient } from "pg";
import { Injector } from "typed-inject";
import {
  RepositoryRead,
  RepositoryWrite,
} from "../interfaces/repository-interfaces.js";
import { JunctionHelper } from "./junction-helper.js";

export type DatabaseProvider = { getPool: () => Pool };

export class PostgreSQLGenericRepository<T extends { [k: string]: unknown }>
  implements RepositoryRead<T>, RepositoryWrite<T>
{
  protected junctions: Record<string, JunctionHelper> = {};

  constructor(
    protected tableName: string,
    protected injector: Injector<DatabaseProvider>
  ) {}

  async findByPattern(item: Partial<T>): Promise<(T & schemas.WithIdBase)[]> {
    const { clause, values } = this.buildWhereClause(item);
    const query = this.buildSelectQuery(clause);
    const client = await this.getClient();
    try {
      const result = await client.query(query, values);
      return result.rows.map((row: Record<string, unknown>) =>
        this.mapRowToEntity(row)
      );
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<(T & schemas.WithIdBase) | null> {
    const query = this.buildSelectQuery("t.id = $1");
    const client = await this.getClient();
    try {
      const result = await client.query(query, [id]);
      if (result.rows.length === 0) return null;
      return this.mapRowToEntity(result.rows[0] as Record<string, unknown>);
    } finally {
      client.release();
    }
  }

  async create(item: T): Promise<T & schemas.WithIdBase> {
    const { mainItem, junctionData } = this.splitJunctions(item);
    delete mainItem["id"];

    const transformed = this.transformOnWrite(mainItem as Partial<T>);
    const keys = Object.keys(transformed);
    const values = keys.map((k) => (transformed as Record<string, unknown>)[k]);
    const columns = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

    const query = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const client = await this.getClient();
    try {
      const result = await client.query(query, values);
      const entityId = (result.rows[0] as Record<string, unknown>).id as string;

      for (const [key, ids] of Object.entries(junctionData)) {
        if (ids.length > 0) {
          await this.junctions[key].replaceAll(entityId, ids);
        }
      }
      return {
        ...item,
        id: entityId,
      };
      // return {
      //   ...(result.rows[0] as Record<string, unknown>),
      //   ...junctionData,
      //   id: entityId,
      // } as unknown as T & schemas.WithIdBase;
    } finally {
      client.release();
    }
  }

  async updateById(id: string, item: Partial<T>): Promise<boolean> {
    const { mainItem, junctionData } = this.splitJunctions(item);
    delete mainItem["id"];

    const transformed = this.transformOnWrite(mainItem as Partial<T>);
    const keys = Object.keys(transformed);
    let mainUpdated = true;

    if (keys.length > 0) {
      const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const values = keys.map(
        (k) => (transformed as Record<string, unknown>)[k]
      );
      values.push(id);

      const query = `UPDATE ${this.tableName} SET ${setClause} WHERE id = $${values.length}`;
      const client = await this.getClient();
      try {
        const result = await client.query(query, values);
        mainUpdated = (result.rowCount ?? 0) > 0;
      } finally {
        client.release();
      }
    }

    for (const [key, ids] of Object.entries(junctionData)) {
      await this.junctions[key].replaceAll(id, ids);
    }

    return mainUpdated || Object.keys(junctionData).length > 0;
  }

  async deleteById(id: string): Promise<boolean> {
    // Explicitly clear junction rows before deleting the main row
    // (the DB has ON DELETE CASCADE, but being explicit is safer)
    for (const junction of Object.values(this.junctions)) {
      await junction.replaceAll(id, []);
    }

    const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const client = await this.getClient();
    try {
      const result = await client.query(query, [id]);
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  protected getPool(): Pool {
    return this.injector.resolve("getPool")();
  }

  protected async getClient(): Promise<PoolClient> {
    return this.getPool().connect();
  }

  protected transformOnRead(e: T & schemas.WithIdBase): T & schemas.WithIdBase {
    return e;
  }

  protected transformOnWrite(e: Partial<T>): Partial<T> {
    return { ...e };
  }

  protected mapRowToEntity(
    row: Record<string, unknown>
  ): T & schemas.WithIdBase {
    const result = Object.fromEntries(
      Object.entries(row).map(([k, v]) => {
        if (v === null) return [k, undefined];
        if (Array.isArray(v) && v.length === 0 && k in this.junctions)
          return [k, undefined];
        return [k, v];
      })
    ) as T & schemas.WithIdBase;
    return this.transformOnRead(result);
  }

  /**
   * Builds a SELECT with correlated ARRAY subqueries for each junction.
   * ARRAY(SELECT ...) returns '{}' (empty array) when no rows match.
   */
  private buildSelectQuery(whereClause: string): string {
    const jKeys = Object.keys(this.junctions);

    const subqueries = jKeys.map((key) => {
      const { table, entityCol, relatedCol } = this.junctions[key].config;
      return `ARRAY(SELECT j."${relatedCol}"::text FROM ${table} j WHERE j."${entityCol}" = t.id) AS "${key}"`;
    });

    const select =
      jKeys.length > 0 ? `SELECT t.*, ${subqueries.join(", ")}` : `SELECT t.*`;

    return `${select} FROM ${this.tableName} t WHERE ${whereClause}`;
  }

  private buildWhereClause(item: Partial<T>): {
    clause: string;
    values: unknown[];
  } {
    const entries = Object.entries(item).filter(
      ([k]) => !(k in this.junctions) && k !== "id"
    );

    if (entries.length === 0) {
      return { clause: "TRUE", values: [] };
    }

    const values: unknown[] = [];
    const conditions = entries.map(([key, value]) => {
      if (value === null || value === undefined) {
        return `t."${key}" IS NULL`;
      }
      values.push(value);
      return `t."${key}" = $${values.length}`;
    });

    return { clause: conditions.join(" AND "), values };
  }

  /** Separates junction-managed fields from main table columns */
  private splitJunctions(item: Partial<T>): {
    mainItem: Record<string, unknown>;
    junctionData: Record<string, string[]>;
  } {
    const junctionData: Record<string, string[]> = {};
    const mainItem = { ...item } as Record<string, unknown>;
    for (const key of Object.keys(this.junctions)) {
      if (key in mainItem) {
        junctionData[key] = (mainItem[key] as string[]) || [];
        delete mainItem[key];
      }
    }
    return { mainItem, junctionData };
  }
}
