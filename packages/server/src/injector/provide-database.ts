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

import { Injector, INJECTOR_TOKEN } from "typed-inject";
import { AgentRepository } from "../database/repositories/interfaces/agent-repository-interface.js";
import { ConnectionOptionsRepository } from "../database/repositories/interfaces/connection-options-repository.js";
import { JWTTokenRepository } from "../database/repositories/interfaces/jwt-token-repository-interface.js";
import { ProjectRepository } from "../database/repositories/interfaces/project-repository-interface.js";
import { MCPServerOptionsRepository } from "../database/repositories/interfaces/server-options-repository-interface.js";
import { TestbedAgentRepository } from "../database/repositories/interfaces/testbed-agent-repository-interface.js";
import { UsersRepository } from "../database/repositories/interfaces/user-repository-interface.js";

// MongoDB imports
import { MongoDbAgentRepository } from "../database/repositories/mongodb/mongo-db-agent-repository.js";
import { MongoDBConnectionOptionsRepository } from "../database/repositories/mongodb/mongo-db-connection-options-repository.js";
import { DatabaseProvider as MongoDatabaseProvider } from "../database/repositories/mongodb/mongo-db-generic-repository.js";
import { MongoDbJWTTokenRepository } from "../database/repositories/mongodb/mongo-db-jwt-token-repository.js";
import { MongoDbProjectRepository } from "../database/repositories/mongodb/mongo-db-project-repository.js";
import { MongoDBMCPServerOptionsRepository } from "../database/repositories/mongodb/mongo-db-server-options-repository.js";
import { MongoDbTestbedAgentRepository } from "../database/repositories/mongodb/mongo-db-testbed-agent-repository.js";
import { MongoDBUserRepository } from "../database/repositories/mongodb/mongo-db-user-repository.js";
import { getDatabase } from "../database/repositories/mongodb/mongodb.js";

// PostgreSQL imports
import { repositoryWriteDecorate } from "../database/repositories/interfaces/decorators/respository-write-decorators.js";
import { PostgreSQLAgentRepository } from "../database/repositories/postgres/postgres-agent-repository.js";
import { PostgreSQLConnectionOptionsRepository } from "../database/repositories/postgres/postgres-connection-options-repository.js";
import { DatabaseProvider as PgDatabaseProvider } from "../database/repositories/postgres/postgres-generic-repository.js";
import { PostgreSQLJWTTokenRepository } from "../database/repositories/postgres/postgres-jwt-token-repository.js";
import { PostgreSQLProjectRepository } from "../database/repositories/postgres/postgres-project-repository.js";
import { PostgreSQLMCPServerOptionsRepository } from "../database/repositories/postgres/postgres-server-options-repository.js";
import { PostgreSQLTestbedAgentRepository } from "../database/repositories/postgres/postgres-testbed-agent-repository.js";
import { PostgreSQLUserRepository } from "../database/repositories/postgres/postgres-user-repository.js";
import { getPool } from "../database/repositories/postgres/postgresql.js";
import { logUpdateCall } from "../database/repositories/interfaces/decorators/server-decorator-functions.js";

export function getDatabaseType() {
  const dbTypeMatch = process.env.DB_URI?.match("^(\\w+):");
  if (
    dbTypeMatch &&
    dbTypeMatch.length >= 2 &&
    ["mongodb", "postgresql"].includes(dbTypeMatch[1])
  ) {
    return dbTypeMatch[1];
  }
  throw new Error(
    `Unsupported database type ${dbTypeMatch && dbTypeMatch.length >= 2 ? dbTypeMatch[1] : "undefined"}`
  );
}

// --- MongoDB factory helpers ---

function mongoFactory<R, T extends R>(clazz: {
  new (i: Injector<MongoDatabaseProvider>): T;
}) {
  const c = (injector: Injector<MongoDatabaseProvider>) => {
    return new clazz(injector) as R;
  };
  c.inject = [INJECTOR_TOKEN] as const;
  return c;
}

function mongoFactoryWithSecret<R, T extends R>(clazz: {
  new (
    s: string,
    i: Injector<MongoDatabaseProvider & { serverSecret: string }>
  ): T;
}) {
  const c = (
    serverSecret: string,
    injector: Injector<MongoDatabaseProvider & { serverSecret: string }>
  ) => {
    return new clazz(serverSecret, injector) as R;
  };
  c.inject = ["serverSecret", INJECTOR_TOKEN] as const;
  return c;
}

// --- PostgreSQL factory helpers ---

function pgFactory<R, T extends R>(clazz: {
  new (i: Injector<PgDatabaseProvider>): T;
}) {
  const c = (injector: Injector<PgDatabaseProvider>) => {
    return new clazz(injector) as R;
  };
  c.inject = [INJECTOR_TOKEN] as const;
  return c;
}

function pgFactoryWithSecret<R, T extends R>(clazz: {
  new (
    s: string,
    i: Injector<PgDatabaseProvider & { serverSecret: string }>
  ): T;
}) {
  const c = (
    serverSecret: string,
    injector: Injector<PgDatabaseProvider & { serverSecret: string }>
  ) => {
    return new clazz(serverSecret, injector) as R;
  };
  c.inject = ["serverSecret", INJECTOR_TOKEN] as const;
  return c;
}

// --- Provider functions ---

function provideMongoDBDatabase<T extends { serverSecret: string }>(
  injector: Injector<T>
) {
  return injector
    .provideValue("getDatabase", () => getDatabase())
    .provideFactory(
      "userRepository",
      mongoFactory<UsersRepository, MongoDBUserRepository>(
        MongoDBUserRepository
      )
    )
    .provideFactory(
      "connectionOptionsRepository",
      mongoFactoryWithSecret<
        ConnectionOptionsRepository,
        MongoDBConnectionOptionsRepository
      >(MongoDBConnectionOptionsRepository)
    )
    .provideFactory(
      "serverOptionsRepository",
      mongoFactory<
        MCPServerOptionsRepository,
        MongoDBMCPServerOptionsRepository
      >(MongoDBMCPServerOptionsRepository)
    )
    .provideFactory(
      "projectRepository",
      mongoFactory<ProjectRepository, MongoDbProjectRepository>(
        MongoDbProjectRepository
      )
    )
    .provideFactory(
      "tokenRepository",
      mongoFactory<JWTTokenRepository, MongoDbJWTTokenRepository>(
        MongoDbJWTTokenRepository
      )
    )
    .provideFactory(
      "agentRepository",
      mongoFactoryWithSecret<AgentRepository, MongoDbAgentRepository>(
        MongoDbAgentRepository
      )
    )
    .provideFactory(
      "testbedAgentRepository",
      mongoFactoryWithSecret<
        TestbedAgentRepository,
        MongoDbTestbedAgentRepository
      >(MongoDbTestbedAgentRepository)
    );
}

function providePostgreSQLDatabase<T extends { serverSecret: string }>(
  injector: Injector<T>
) {
  return injector
    .provideValue("getPool", () => getPool())
    .provideFactory(
      "userRepository",
      pgFactory<UsersRepository, PostgreSQLUserRepository>(
        PostgreSQLUserRepository
      )
    )
    .provideFactory(
      "connectionOptionsRepository",
      pgFactoryWithSecret<
        ConnectionOptionsRepository,
        PostgreSQLConnectionOptionsRepository
      >(PostgreSQLConnectionOptionsRepository)
    )
    .provideFactory(
      "serverOptionsRepository",
      pgFactory<
        MCPServerOptionsRepository,
        PostgreSQLMCPServerOptionsRepository
      >(PostgreSQLMCPServerOptionsRepository)
    )
    .provideFactory(
      "projectRepository",
      pgFactory<ProjectRepository, PostgreSQLProjectRepository>(
        PostgreSQLProjectRepository
      )
    )
    .provideFactory(
      "tokenRepository",
      pgFactory<JWTTokenRepository, PostgreSQLJWTTokenRepository>(
        PostgreSQLJWTTokenRepository
      )
    )
    .provideFactory(
      "agentRepository",
      pgFactoryWithSecret<AgentRepository, PostgreSQLAgentRepository>(
        PostgreSQLAgentRepository
      )
    )
    .provideFactory(
      "testbedAgentRepository",
      pgFactoryWithSecret<
        TestbedAgentRepository,
        PostgreSQLTestbedAgentRepository
      >(PostgreSQLTestbedAgentRepository)
    );
}

export function provideDatabase<T extends { serverSecret: string }>(
  injector: Injector<T>
): ReturnType<typeof provideMongoDBDatabase<T>> {
  let injector2: ReturnType<typeof provideMongoDBDatabase<T>>;

  switch (getDatabaseType()) {
    case "postgresql":
      injector2 = providePostgreSQLDatabase(injector) as ReturnType<
        typeof provideMongoDBDatabase<T>
      >;
      break;
    case "mongodb":
    default:
      injector2 = provideMongoDBDatabase(injector);
  }
  // return injector2;
  const newInjector: ReturnType<typeof provideMongoDBDatabase<T>> =
    injector2.provideFactory(
      "connectionOptionsRepository",
      repositoryWriteDecorate("connectionOptionsRepository", [logUpdateCall])
    );
  return newInjector;
}
