import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { Contract } from "./contracts/contract.entity";
import { ContractsModule } from "./contracts/contracts.module";
import { DepositRecord } from "./deposits/deposit-record.entity";
import { DepositsModule } from "./deposits/deposits.module";
import { StoredFile } from "./files/stored-file.entity";
import { FilesModule } from "./files/files.module";
import { Receipt } from "./receipts/receipt.entity";
import { ReceiptsModule } from "./receipts/receipts.module";
import { RentPayment } from "./rent-payments/rent-payment.entity";
import { RentPaymentsModule } from "./rent-payments/rent-payments.module";
import { FactoryUnit } from "./units/factory-unit.entity";
import { UnitsModule } from "./units/units.module";
import { AdminUser } from "./users/admin-user.entity";
import { UsersModule } from "./users/users.module";
import { UtilityChargeItem } from "./utilities/utility-charge-item.entity";
import { UtilityChargeRecord } from "./utilities/utility-charge-record.entity";
import { UtilityMeterConfig } from "./utilities/utility-meter-config.entity";
import { UtilitiesModule } from "./utilities/utilities.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("DB_HOST", "postgres"),
        port: Number(config.get<string>("DB_PORT", "5432")),
        username: config.get<string>("DB_USER", "postgres"),
        password: config.get<string>("DB_PASSWORD", "postgres"),
        database: config.get<string>("DB_NAME", "factory_rental"),
        synchronize: config.get<string>("DB_SYNCHRONIZE", "true") === "true",
        autoLoadEntities: true,
        entities: [
          AdminUser,
          StoredFile,
          FactoryUnit,
          Contract,
          UtilityMeterConfig,
          UtilityChargeRecord,
          UtilityChargeItem,
          RentPayment,
          DepositRecord,
          Receipt,
        ],
      }),
    }),
    UsersModule,
    AuthModule,
    FilesModule,
    UnitsModule,
    ContractsModule,
    UtilitiesModule,
    RentPaymentsModule,
    DepositsModule,
    ReceiptsModule,
  ],
})
export class AppModule {}
