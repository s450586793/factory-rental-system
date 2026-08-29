import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { DataSource, Repository } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { toCents } from "../common/money/cents";
import { FilesService } from "../files/files.service";
import { RentReceivablesService } from "../rent-receivables/rent-receivables.service";
import { FactoryUnit } from "../units/factory-unit.entity";
import {
  buildContractDocumentPdf,
  buildGeneratedContractFilename,
} from "./contract-document";
import { BillingFrequency, DepositSettlementMode } from "./contract.enums";
import { Contract, ContractStatus } from "./contract.entity";
import { CreateContractDto, UpdateContractDto } from "./contracts.dto";

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

const CONTRACT_DOCUMENT_CACHE_VERSION = "2026-08-28-v5";

type GeneratedContractDocument = {
  filename: string;
  mimeType: "application/pdf";
  buffer: Buffer;
};

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly documentBuilds = new Map<
    string,
    Promise<GeneratedContractDocument>
  >();

  constructor(
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(FactoryUnit)
    private readonly unitsRepository: Repository<FactoryUnit>,
    private readonly filesService: FilesService,
    private readonly dataSource: DataSource,
    private readonly rentReceivablesService: RentReceivablesService,
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

  async create(dto: CreateContractDto) {
    this.assertOptionalContractFieldsNotNull(dto);
    await this.ensureUnitExists(dto.unitId);
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
      return repository.findOneOrFail({ where: { id: saved.id } });
    });
    void this.prepareDocumentAfterSave(saved.id);
    return saved;
  }

  async update(id: string, dto: UpdateContractDto) {
    this.assertOptionalContractFieldsNotNull(dto);
    const contract = await this.findOneOrFail(id);
    const nextBillingFrequency =
      dto.billingFrequency ?? contract.billingFrequency;
    const scheduleShapeChanged =
      contract.startDate !== dto.startDate ||
      contract.endDate !== dto.endDate ||
      toCents(contract.annualRent) !== toCents(dto.annualRent) ||
      contract.billingFrequency !== nextBillingFrequency;
    await this.ensureUnitExists(dto.unitId);
    await this.validateRange(dto.startDate, dto.endDate, dto.unitId, id);
    const { businessLicenseFile, attachmentFiles } = await this.resolveFiles(
      dto.businessLicenseFileId,
      dto.attachmentFileIds ?? [],
    );
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
    contract.earlyTerminationPenaltyAmount = dto.earlyTerminationPenaltyAmount;
    contract.billingFrequency = nextBillingFrequency;
    contract.status = resolveContractStatus(dto.startDate, dto.endDate);
    contract.businessLicenseFileId = businessLicenseFile?.id ?? null;
    contract.businessLicenseFile = businessLicenseFile ?? null;
    contract.attachmentFiles = attachmentFiles;

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Contract);
      const saved = await repository.save(repository.create(contract));
      if (scheduleShapeChanged) {
        await this.rentReceivablesService.syncContractSchedules(manager, saved);
      }
      return repository.findOneOrFail({ where: { id: saved.id } });
    });
    void this.prepareDocumentAfterSave(saved.id);
    return saved;
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.contractsRepository.softDelete(id);
    await this.filesService.removeGeneratedContractDocuments(id);
    return { success: true };
  }

  async generateDocument(id: string) {
    const contract = await this.findOneOrFail(id);
    const unit = await this.unitsRepository.findOne({
      where: { id: contract.unitId },
      relations: { meterConfigs: true },
    });

    if (!unit) {
      throw new BadRequestException("厂房不存在");
    }

    const filename = buildGeneratedContractFilename(contract, unit);
    const revision = this.buildDocumentRevision(contract, unit);
    const cached = await this.filesService.readGeneratedContractDocument(
      id,
      revision,
    );
    if (cached) {
      return {
        filename,
        mimeType: "application/pdf" as const,
        buffer: cached,
      };
    }

    const buildKey = `${id}:${revision}`;
    const inFlight = this.documentBuilds.get(buildKey);
    if (inFlight) {
      return inFlight;
    }

    const build = this.buildAndCacheDocument(
      contract,
      unit,
      filename,
      revision,
    );
    this.documentBuilds.set(buildKey, build);

    try {
      return await build;
    } finally {
      if (this.documentBuilds.get(buildKey) === build) {
        this.documentBuilds.delete(buildKey);
      }
    }
  }

  private async buildAndCacheDocument(
    contract: Contract,
    unit: FactoryUnit & { meterConfigs: FactoryUnit["meterConfigs"] },
    filename: string,
    revision: string,
  ): Promise<GeneratedContractDocument> {
    const buffer = await buildContractDocumentPdf({
      contract,
      unit,
      generatedDate: formatShanghaiDate(),
    });
    await this.filesService.saveGeneratedContractDocument(
      contract.id,
      revision,
      buffer,
    );
    return {
      filename,
      mimeType: "application/pdf",
      buffer,
    };
  }

  private async prepareDocumentAfterSave(contractId: string) {
    try {
      await this.generateDocument(contractId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      this.logger.error(`合同 ${contractId} PDF 预生成失败：${message}`);
    }
  }

  private buildDocumentRevision(
    contract: Contract,
    unit: FactoryUnit & { meterConfigs: FactoryUnit["meterConfigs"] },
  ) {
    const meters = [...(unit.meterConfigs ?? [])]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((meter) => ({
        id: meter.id,
        type: meter.type,
        name: meter.name,
        unitPrice: meter.unitPrice,
        lineLossPercent: meter.lineLossPercent,
        enabled: meter.enabled,
      }));
    const payload = {
      version: CONTRACT_DOCUMENT_CACHE_VERSION,
      contract: {
        lessorName: contract.lessorName,
        lessorLicenseCode: contract.lessorLicenseCode,
        lessorContactName: contract.lessorContactName,
        lessorPhone: contract.lessorPhone,
        lessorSafetyManager: contract.lessorSafetyManager,
        tenantName: contract.tenantName,
        contactName: contract.contactName,
        tenantPhone: contract.tenantPhone,
        licenseCode: contract.licenseCode,
        tenantSafetyManager: contract.tenantSafetyManager,
        signedDate: contract.signedDate,
        startDate: contract.startDate,
        endDate: contract.endDate,
        annualRent: contract.annualRent,
        depositAmount: contract.depositAmount,
        earlyTerminationPenaltyAmount: contract.earlyTerminationPenaltyAmount,
        billingFrequency: contract.billingFrequency,
      },
      unit: {
        code: unit.code,
        location: unit.location,
        area: unit.area,
        meters,
      },
    };

    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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
