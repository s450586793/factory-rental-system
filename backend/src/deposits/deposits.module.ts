import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contract } from "../contracts/contract.entity";
import { DepositRecord } from "./deposit-record.entity";
import { DepositsController } from "./deposits.controller";
import { DepositsService } from "./deposits.service";

@Module({
  imports: [TypeOrmModule.forFeature([DepositRecord, Contract])],
  controllers: [DepositsController],
  providers: [DepositsService],
  exports: [DepositsService, TypeOrmModule],
})
export class DepositsModule {}
