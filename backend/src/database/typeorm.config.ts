import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { DataSourceOptions } from "typeorm";
import type { DatabaseConfig } from "../config/database.config";
import { databaseEntities } from "./entities";
import { InitialSchema1711600000000 } from "./migrations/1711600000000-initial-schema";
import { ReconcileContractSchema1711700000000 } from "./migrations/1711700000000-reconcile-contract-schema";
import { AddUnitArea1711900000000 } from "./migrations/1711900000000-add-unit-area";
import { AddContractContactFields1712100000000 } from "./migrations/1712100000000-add-contract-contact-fields";
import { AddContractDepositAmount1712200000000 } from "./migrations/1712200000000-add-contract-deposit-amount";
import { AddPaymentVoucherAttachments1712300000000 } from "./migrations/1712300000000-add-payment-voucher-attachments";
import { AddContractLessorFields1712400000000 } from "./migrations/1712400000000-add-contract-lessor-fields";
import { AddUtilityPaymentVoucherAttachments1712500000000 } from "./migrations/1712500000000-add-utility-payment-voucher-attachments";

export const databaseMigrations = [
  InitialSchema1711600000000,
  ReconcileContractSchema1711700000000,
  AddUnitArea1711900000000,
  AddContractContactFields1712100000000,
  AddContractDepositAmount1712200000000,
  AddPaymentVoucherAttachments1712300000000,
  AddContractLessorFields1712400000000,
  AddUtilityPaymentVoucherAttachments1712500000000,
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
