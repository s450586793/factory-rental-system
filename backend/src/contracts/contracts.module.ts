import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../files/files.module";
import { RentReceivablesModule } from "../rent-receivables/rent-receivables.module";
import { FactoryUnit } from "../units/factory-unit.entity";
import { Contract } from "./contract.entity";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractDocumentJob } from "./contract-document-job.entity";
import { ContractFinancialHistory } from "./contract-financial-history.entity";
import { ContractDocumentQueueService } from "./contract-document-queue.service";
import { ContractPdfRendererService } from "./contract-pdf-renderer.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contract,
      FactoryUnit,
      ContractDocumentJob,
      ContractFinancialHistory,
    ]),
    FilesModule,
    RentReceivablesModule,
  ],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    ContractDocumentQueueService,
    ContractPdfRendererService,
  ],
  exports: [ContractsService, TypeOrmModule],
})
export class ContractsModule {}
