import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Receipt } from "../receipts/receipt.entity";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { RentReceivableSchedule } from "../rent-receivables/rent-receivable-schedule.entity";
import { RentReconciliationController } from "./rent-reconciliation.controller";
import { RentReconciliationService } from "./rent-reconciliation.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([RentReceivableSchedule, RentPayment, Receipt]),
  ],
  controllers: [RentReconciliationController],
  providers: [RentReconciliationService],
})
export class RentReconciliationModule {}
