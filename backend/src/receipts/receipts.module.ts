import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../files/files.module";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { UtilityChargeRecord } from "../utilities/utility-charge-record.entity";
import { Receipt } from "./receipt.entity";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [TypeOrmModule.forFeature([Receipt, UtilityChargeRecord, RentPayment]), FilesModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService, TypeOrmModule],
})
export class ReceiptsModule {}
