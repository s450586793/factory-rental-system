import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contract } from "../contracts/contract.entity";
import { FilesModule } from "../files/files.module";
import { Receipt } from "../receipts/receipt.entity";
import { RentReceivableSchedule } from "../rent-receivables/rent-receivable-schedule.entity";
import { RentReceivablesModule } from "../rent-receivables/rent-receivables.module";
import { RentPayment } from "./rent-payment.entity";
import { RentPaymentsController } from "./rent-payments.controller";
import { RentPaymentsService } from "./rent-payments.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RentPayment,
      Contract,
      Receipt,
      RentReceivableSchedule,
    ]),
    FilesModule,
    RentReceivablesModule,
  ],
  controllers: [RentPaymentsController],
  providers: [RentPaymentsService],
  exports: [RentPaymentsService, TypeOrmModule],
})
export class RentPaymentsModule {}
