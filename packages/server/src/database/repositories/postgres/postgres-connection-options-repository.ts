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
import { ConnectionOptionsRepository } from "../interfaces/connection-options-repository.js";
import { DatabaseProvider } from "./postgres-generic-repository.js";
import { JunctionHelper } from "./junction-helper.js";
import { PostgreSQLVisibilityRepository } from "./postgres-visibility-repository.js";

export class PostgreSQLConnectionOptionsRepository
  extends PostgreSQLVisibilityRepository<schemas.MCPConnectionOptions>
  implements ConnectionOptionsRepository
{
  public static inject = ["serverSecret", INJECTOR_TOKEN] as const;
  constructor(
    private serverSecret: string,
    injector: Injector<DatabaseProvider>
  ) {
    super("clients", injector);
    this.junctions.projects = new JunctionHelper(
      this.getPool(),
      "client_to_projects",
      "clientId",
      "projectId"
    );
  }

  async unsetCreator(id: string): Promise<boolean> {
    const client = await this.getClient();
    try {
      const result = await client.query(
        `UPDATE clients SET creator = NULL WHERE id = $1`,
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async findByVersionGroupingUUID(
    versionGroupingUUID: string
  ): Promise<schemas.MCPConnectionOptionsWithId[]> {
    const result = await this.findByPattern({
      versionGroupingUUID,
    } as Partial<schemas.MCPConnectionOptionsWithId>);

    return result.sort((a, b) => {
      if (a.versioningInfo && b.versioningInfo) {
        return a.versioningInfo.versionNumber - b.versioningInfo.versionNumber;
      }
      return 0;
    });
  }

  protected transformOnRead(
    e: schemas.MCPConnectionOptions & schemas.WithIdBase
  ): schemas.MCPConnectionOptions & schemas.WithIdBase {
    const authTransformed = this.transformAuth(e, (v, key) => {
      try {
        return decrypt(v, key);
      } catch {
        return v;
      }
    });
    return this.unFlatVersioningInfo(authTransformed);
  }

  protected transformOnWrite(
    e: Partial<schemas.MCPConnectionOptions>
  ): Partial<schemas.MCPConnectionOptions> {
    const authTransformed = this.transformAuth(cloneDeep(e), encrypt);
    return this.flatVersioningInfo(authTransformed);
  }

  private unFlatVersioningInfo(
    e: schemas.MCPConnectionOptions &
      schemas.WithIdBase & {
        versionNumber?: number;
        versionGroupingUUID?: string;
      }
  ): schemas.MCPConnectionOptions & schemas.WithIdBase {
    if (e.versionGroupingUUID && e.versionNumber) {
      const result = {
        ...e,
        versioningInfo: {
          versionNumber: parseInt("" + e.versionNumber),
          versionGroupingUUID: e.versionGroupingUUID,
        },
      };
      delete result.versionGroupingUUID;
      delete result.versionNumber;
      return result;
    }
    return e;
  }

  private flatVersioningInfo(e: Partial<schemas.MCPConnectionOptions>): Partial<
    Omit<schemas.MCPConnectionOptions, "versioningInfo"> & {
      versionNumber?: number;
      versionGroupingUUID?: string;
    }
  > {
    if (!e.versioningInfo) {
      return e;
    }

    const versioningInfo = e.versioningInfo;

    const result = {
      ...e,
      versionNumber: versioningInfo.versionNumber,
      versionGroupingUUID: versioningInfo.versionGroupingUUID,
    };

    delete result.versioningInfo;
    return result;
  }

  private transformAuth<T extends { authentication?: schemas.Authentication }>(
    e: T,
    fun: (v: string, key: string) => string
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
          e.authentication.clientSecret = fun(
            e.authentication.clientSecret,
            this.serverSecret
          );
          break;
      }
    }
    return e;
  }
}
