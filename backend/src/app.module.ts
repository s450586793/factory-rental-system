import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import appConfig from "./config/app.config";
import authConfig from "./config/auth.config";
import databaseConfig from "./config/database.config";
import storageConfig from "./config/storage.config";
import { validateEnvironment } from "./config/env.validation";
import { ContractsModule } from "./contracts/contracts.module";
import { buildTypeOrmModuleOptions } from "./database/typeorm.config";
import { DepositsModule } from "./deposits/deposits.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { ReceiptsModule } from "./receipts/receipts.module";
import { RentPaymentsModule } from "./rent-payments/rent-payments.module";
import { UnitsModule } from "./units/units.module";
import { UsersModule } from "./users/users.module";
import { UtilitiesModule } from "./utilities/utilities.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
      validate: validateEnvironment,
      load: [appConfig, authConfig, databaseConfig, storageConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildTypeOrmModuleOptions(config),
    }),
    UsersModule,
    AuthModule,
    FilesModule,
    HealthModule,
    UnitsModule,
    ContractsModule,
    UtilitiesModule,
    RentPaymentsModule,
    DepositsModule,
    ReceiptsModule,
  ],
})
export class AppModule {}
