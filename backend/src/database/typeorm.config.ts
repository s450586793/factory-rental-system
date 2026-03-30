import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { DataSourceOptions } from "typeorm";
import type { DatabaseConfig } from "../config/database.config";
import { databaseEntities } from "./entities";
import { InitialSchema1711600000000 } from "./migrations/1711600000000-initial-schema";
import { ReconcileContractSchema1711700000000 } from "./migrations/1711700000000-reconcile-contract-schema";
import { AddUnitArea1711900000000 } from "./migrations/1711900000000-add-unit-area";
import { AddContractContactFields1712100000000 } from "./migrations/1712100000000-add-contract-contact-fields";

export const databaseMigrations = [
  InitialSchema1711600000000,
  ReconcileContractSchema1711700000000,
  AddUnitArea1711900000000,
  AddContractContactFields1712100000000,
];

export function buildTypeOrmOptions(database: DatabaseConfig): DataSourceOptions {
  return {
    type: "postgres",
    host: database.host,
    port: database.port,
    username: database.username,
    password: database.password,
    database: database.database,
    synchronize: database.synchronize,
    entities: databaseEntities,
    migrations: databaseMigrations,
    migrationsTableName: "typeorm_migrations",
  };
}

export function buildTypeOrmModuleOptions(configService: ConfigService): TypeOrmModuleOptions {
  const database = configService.getOrThrow<DatabaseConfig>("database");
  return buildTypeOrmOptions(database);
}
