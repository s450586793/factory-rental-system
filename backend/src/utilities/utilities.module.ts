import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contract } from "../contracts/contract.entity";
import { Receipt } from "../receipts/receipt.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { UtilityChargeItem } from "./utility-charge-item.entity";
import { UtilityChargeRecord } from "./utility-charge-record.entity";
import { UtilityMeterConfig } from "./utility-meter-config.entity";
import { UtilitiesController } from "./utilities.controller";
import { UtilitiesService } from "./utilities.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UtilityMeterConfig,
      UtilityChargeRecord,
      UtilityChargeItem,
      FactoryUnit,
      Contract,
      Receipt,
    ]),
  ],
  controllers: [UtilitiesController],
  providers: [UtilitiesService],
  exports: [UtilitiesService, TypeOrmModule],
})
export class UtilitiesModule {}
