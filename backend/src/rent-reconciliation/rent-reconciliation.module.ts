import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contract } from "../contracts/contract.entity";
import { Receipt } from "../receipts/receipt.entity";
import { RentReconciliationController } from "./rent-reconciliation.controller";
import { RentReconciliationService } from "./rent-reconciliation.service";

@Module({
  imports: [TypeOrmModule.forFeature([Contract, Receipt])],
  controllers: [RentReconciliationController],
  providers: [RentReconciliationService],
})
export class RentReconciliationModule {}
