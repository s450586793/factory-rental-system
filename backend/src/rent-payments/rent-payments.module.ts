import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contract } from "../contracts/contract.entity";
import { Receipt } from "../receipts/receipt.entity";
import { RentPayment } from "./rent-payment.entity";
import { RentPaymentsController } from "./rent-payments.controller";
import { RentPaymentsService } from "./rent-payments.service";

@Module({
  imports: [TypeOrmModule.forFeature([RentPayment, Contract, Receipt])],
  controllers: [RentPaymentsController],
  providers: [RentPaymentsService],
  exports: [RentPaymentsService, TypeOrmModule],
})
export class RentPaymentsModule {}
