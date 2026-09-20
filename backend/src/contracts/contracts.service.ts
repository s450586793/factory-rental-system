import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { toCents } from "../common/money/cents";
import { FilesService } from "../files/files.service";
import { StoredFileCategory } from "../files/stored-file.entity";
import { RentReceivablesService } from "../rent-receivables/rent-receivables.service";
import { FactoryUnit } from "../units/factory-unit.entity";
import { ContractDocumentQueueService } from "./contract-document-queue.service";
import { ContractDocumentJob } from "./contract-document-job.entity";
import { ContractFinancialHistory } from "./contract-financial-history.entity";
import {
  appendContractFinancialHistory,
  ContractActor,
} from "./contract-financial-history";
import { BillingFrequency, DepositSettlementMode } from "./contract.enums";
import { Contract, ContractStatus } from "./contract.entity";
import { AddContractAttachmentsDto, CreateContractDto, UpdateContractDto } from "./contracts.dto";

function resolveContractStatus(startDate: string, endDate: string) {
  const today = formatShanghaiDate();
  if (startDate > today) {
    return ContractStatus.FUTURE;
  }
  if (endDate < today) {
    return ContractStatus.EXPIRED;
  }
  return ContractStatus.ACTIVE;
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(FactoryUnit)
    private readonly unitsRepository: Repository<FactoryUnit>,
    private readonly filesService: FilesService,
    private readonly dataSource: DataSource,
    private readonly rentReceivablesService: RentReceivablesService,
    private readonly documentQueue: ContractDocumentQueueService,
  ) {}

  async list(unitId?: string) {
    return this.contractsRepository.find({
      where: unitId ? { unitId } : {},
      order: {
        startDate: "DESC",
        createdAt: "DESC",
      },
    });
  }

  async findOneOrFail(id: string) {
    const contract = await this.contractsRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException("合同不存在");
    }
    return contract;
  }

  async create(dto: CreateContractDto, actor?: ContractActor) {
    this.assertOptionalContractFieldsNotNull(dto);
    const unit = await this.ensureUnitExists(dto.unitId);
    await this.validateRange(dto.startDate, dto.endDate, dto.unitId);
    const { businessLicenseFile, attachmentFiles } = await this.resolveFiles(
      dto.businessLicenseFileId,
      dto.attachmentFileIds ?? [],
    );
    const contractValues = {
      unitId: dto.unitId,
      lessorName: dto.lessorName.trim(),
      lessorLicenseCode: dto.lessorLicenseCode?.trim() ?? "",
      lessorContactName: dto.lessorContactName?.trim() ?? "",
      lessorPhone: dto.lessorPhone?.trim() ?? "",
      lessorSafetyManager: dto.lessorSafetyManager.trim(),
      tenantName: dto.tenantName.trim(),
      contactName: dto.contactName?.trim() ?? "",
      tenantPhone: dto.tenantPhone?.trim() ?? "",
      licenseCode: dto.licenseCode?.trim() ?? "",
      tenantSafetyManager: dto.tenantSafetyManager.trim(),
      signedDate: dto.signedDate,
      startDate: dto.startDate,
      endDate: dto.endDate,
      annualRent: dto.annualRent,
      depositAmount: dto.depositAmount,
      electricUnitPrice: dto.electricUnitPrice,
      electricLineLossPercent: dto.electricLineLossPercent,
      waterUnitPrice: dto.waterUnitPrice,
      earlyTerminationPenaltyAmount: dto.earlyTerminationPenaltyAmount,
      billingFrequency: dto.billingFrequency ?? BillingFrequency.ANNUAL,
      depositSettlementMode: DepositSettlementMode.INITIAL,
      depositCarryoverAmount: 0,
      depositCarryoverSourceContractId: null,
      status: resolveContractStatus(dto.startDate, dto.endDate),
      businessLicenseFileId: businessLicenseFile?.id ?? null,
      businessLicenseFile,
      attachmentFiles,
    };

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Contract);
      const saved = await repository.save(repository.create(contractValues));
      await this.rentReceivablesService.syncContractSchedules(manager, saved);
      const persisted = await repository.findOneOrFail({
        where: { id: saved.id },
      });
      await appendContractFinancialHistory(manager, null, persisted, actor);
      await this.documentQueue.enqueue(manager, persisted, unit);
      return persisted;
    });
    this.documentQueue.kick();
    return saved;
  }

  async update(id: string, dto: UpdateContractDto, actor?: ContractActor) {
    this.assertOptionalContractFieldsNotNull(dto);
    const unit = await this.ensureUnitExists(dto.unitId);
    await this.validateRange(dto.startDate, dto.endDate, dto.unitId, id);
    const { businessLicenseFile, attachmentFiles } = await this.resolveFiles(
      dto.businessLicenseFileId,
      dto.attachmentFileIds ?? [],
    );
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Contract);
      const contract = await repository.findOne({
        where: { id },
        lock: { mode: "pessimistic_write" },
        loadEagerRelations: false,
      });
      if (!contract) throw new NotFoundException("合同不存在");
      const before = { ...contract };
      const nextBillingFrequency =
        dto.billingFrequency ?? contract.billingFrequency;
      const scheduleShapeChanged =
        contract.startDate !== dto.startDate ||
        contract.endDate !== dto.endDate ||
        toCents(contract.annualRent) !== toCents(dto.annualRent) ||
        contract.billingFrequency !== nextBillingFrequency;
      contract.unitId = dto.unitId;
      contract.lessorName = dto.lessorName.trim();
      contract.lessorLicenseCode = dto.lessorLicenseCode?.trim() ?? "";
      contract.lessorContactName = dto.lessorContactName?.trim() ?? "";
      contract.lessorPhone = dto.lessorPhone?.trim() ?? "";
      contract.lessorSafetyManager = dto.lessorSafetyManager.trim();
      contract.tenantName = dto.tenantName.trim();
      contract.contactName = dto.contactName?.trim() ?? "";
      contract.tenantPhone = dto.tenantPhone?.trim() ?? "";
      contract.licenseCode = dto.licenseCode?.trim() ?? "";
      contract.tenantSafetyManager = dto.tenantSafetyManager.trim();
      contract.signedDate = dto.signedDate;
      contract.startDate = dto.startDate;
      contract.endDate = dto.endDate;
      contract.annualRent = dto.annualRent;
      contract.depositAmount = dto.depositAmount;
      contract.electricUnitPrice = dto.electricUnitPrice;
      contract.electricLineLossPercent = dto.electricLineLossPercent;
      contract.waterUnitPrice = dto.waterUnitPrice;
      contract.earlyTerminationPenaltyAmount =
        dto.earlyTerminationPenaltyAmount;
      contract.billingFrequency = nextBillingFrequency;
      contract.status = resolveContractStatus(dto.startDate, dto.endDate);
      contract.businessLicenseFileId = businessLicenseFile?.id ?? null;
      contract.businessLicenseFile = businessLicenseFile ?? null;
      contract.attachmentFiles = attachmentFiles;

      const saved = await repository.save(repository.create(contract));
      if (scheduleShapeChanged) {
        await this.rentReceivablesService.syncContractSchedules(manager, saved);
      }
      const persisted = await repository.findOneOrFail({
        where: { id: saved.id },
      });
      await appendContractFinancialHistory(manager, before, persisted, actor);
      await this.documentQueue.enqueue(manager, persisted, unit);
      return persisted;
    });
    this.documentQueue.kick();
    return saved;
  }

  async addAttachments(id: string, dto: AddContractAttachmentsDto) {
    const files = await this.filesService.findByIds(dto.attachmentFileIds);
    if (files.length !== dto.attachmentFileIds.length) {
      throw new BadRequestException("部分合同附件不存在");
    }
    const mimeTypes = new Set([
      "application/pdf", "image/jpeg", "image/png", "image/webp",
    ]);
    if (files.some((file) =>
      file.category !== StoredFileCategory.CONTRACT_ATTACHMENT || !mimeTypes.has(file.mimeType),
    )) {
      throw new BadRequestException("已签合同仅支持合同附件中的 PDF 或图片");
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Contract);
      const locked = await repository.findOne({
        where: { id },
        lock: { mode: "pessimistic_write" },
        loadEagerRelations: false,
      });
      if (!locked) throw new NotFoundException("合同不存在");
      // 在合同锁内读取并追加附件，重试及并发补传均保留已有文件。
      const contract = await repository.findOne({
        where: { id }, relations: { attachmentFiles: true },
      });
      if (!contract) throw new NotFoundException("合同不存在");
      const attachments = new Map((contract.attachmentFiles ?? []).map((file) => [file.id, file]));
      for (const file of files) attachments.set(file.id, file);
      contract.attachmentFiles = [...attachments.values()];
      return repository.save(contract);
    });
  }

  async remove(id: string) {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Contract);
      const contract = await repository.findOne({
        where: { id },
        lock: { mode: "pessimistic_write" },
        loadEagerRelations: false,
      });
      if (!contract) throw new NotFoundException("合同不存在");
      await repository.softDelete(id);
      await manager
        .getRepository(ContractDocumentJob)
        .delete({ contractId: id });
      await this.filesService.removeGeneratedContractDocuments(id);
    });
    return { success: true };
  }

  generateDocument(id: string) {
    return this.documentQueue.generate(id);
  }

  documentStatus(id: string) {
    return this.documentQueue.status(id);
  }

  retryDocument(id: string) {
    return this.documentQueue.status(id, true);
  }

  async history(id: string) {
    await this.findOneOrFail(id);
    return this.dataSource.getRepository(ContractFinancialHistory).find({
      where: { contractId: id },
      order: { createdAt: "DESC", id: "DESC" },
    });
  }

  private async ensureUnitExists(unitId: string) {
    const unit = await this.unitsRepository.findOne({ where: { id: unitId } });
    if (!unit) {
      throw new BadRequestException("厂房不存在");
    }
    return unit;
  }

  private async validateRange(
    startDate: string,
    endDate: string,
    unitId: string,
    excludeId?: string,
  ) {
    if (startDate > endDate) {
      throw new BadRequestException("合同结束日期不能早于开始日期");
    }

    const contracts = await this.contractsRepository.find({
      where: { unitId },
    });

    const overlapped = contracts.find((item) => {
      if (item.id === excludeId) {
        return false;
      }
      return !(endDate < item.startDate || startDate > item.endDate);
    });

    if (overlapped) {
      throw new BadRequestException("该厂房在所选时间段内已有合同记录");
    }
  }

  private async resolveFiles(
    businessLicenseFileId?: string,
    attachmentFileIds: string[] = [],
  ) {
    const normalizedBusinessLicenseId = businessLicenseFileId?.trim() || null;
    const businessLicenseFile = normalizedBusinessLicenseId
      ? await this.filesService.findOneOrFail(normalizedBusinessLicenseId)
      : null;
    const attachmentFiles = attachmentFileIds.length
      ? await this.filesService.findByIds(attachmentFileIds)
      : [];

    if (attachmentFiles.length !== attachmentFileIds.length) {
      throw new BadRequestException("部分合同附件不存在");
    }

    return {
      businessLicenseFile,
      attachmentFiles,
    };
  }

  private assertOptionalContractFieldsNotNull(dto: CreateContractDto): void {
    const fields = [["billingFrequency", "收租周期"]] as const;
    const values = dto as unknown as Record<string, unknown>;

    for (const [field, label] of fields) {
      if (values[field] === null) {
        throw new BadRequestException(`${label}不能为 null`);
      }
    }
  }
}
