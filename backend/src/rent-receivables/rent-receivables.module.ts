import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { RentPaymentAllocation } from "./rent-payment-allocation.entity";
import { RentReceivableSchedule } from "./rent-receivable-schedule.entity";
import { RentReceivablesController } from "./rent-receivables.controller";
import { RentReceivablesService } from "./rent-receivables.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RentReceivableSchedule,
      RentPaymentAllocation,
      RentPayment,
    ]),
  ],
  controllers: [RentReceivablesController],
  providers: [RentReceivablesService],
  exports: [RentReceivablesService, TypeOrmModule],
})
export class RentReceivablesModule {}
