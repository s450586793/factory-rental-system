import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contract } from "../contracts/contract.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";
import { FactoryUnit } from "./factory-unit.entity";
import { UnitsController } from "./units.controller";
import { UnitsService } from "./units.service";

@Module({
  imports: [TypeOrmModule.forFeature([FactoryUnit, Contract, UtilityMeterConfig])],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService, TypeOrmModule],
})
export class UnitsModule {}
