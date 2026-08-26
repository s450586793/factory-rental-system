import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { fromCents, toCents } from "../common/money/cents";
import { DepositsService } from "../deposits/deposits.service";
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

type DepositSettlementSnapshot = Pick<
  Contract,
  | "depositSettlementMode"
  | "depositCarryoverAmount"
  | "depositCarryoverSourceContractId"
>;

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
    private readonly depositsService: DepositsService,
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
    const tenantName = dto.tenantName?.trim() ?? "";
    const depositSettlement = await this.resolveCreateDepositSettlement(
      dto,
      tenantName,
    );
    const contractValues = {
      unitId: dto.unitId,
      lessorName: dto.lessorName?.trim() ?? "",
      lessorLicenseCode: dto.lessorLicenseCode?.trim() ?? "",
      lessorContactName: dto.lessorContactName?.trim() ?? "",
      lessorPhone: dto.lessorPhone?.trim() ?? "",
      tenantName,
      contactName: dto.contactName?.trim() ?? "",
      tenantPhone: dto.tenantPhone?.trim() ?? "",
      licenseCode: dto.licenseCode?.trim() ?? "",
      startDate: dto.startDate,
      endDate: dto.endDate,
      annualRent: dto.annualRent,
      depositAmount: dto.depositAmount,
      billingFrequency: dto.billingFrequency ?? BillingFrequency.ANNUAL,
      ...depositSettlement,
      status: resolveContractStatus(dto.startDate, dto.endDate),
      businessLicenseFileId: businessLicenseFile?.id ?? null,
      businessLicenseFile,
      attachmentFiles,
    };

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Contract);
      const saved = await repository.save(repository.create(contractValues));
      await this.rentReceivablesService.syncContractSchedules(manager, saved);
      return repository.findOneOrFail({ where: { id: saved.id } });
    });
  }

  async update(id: string, dto: UpdateContractDto) {
    this.assertOptionalContractFieldsNotNull(dto);
    const contract = await this.findOneOrFail(id);
    await this.ensureUnitExists(dto.unitId);
    await this.validateRange(dto.startDate, dto.endDate, dto.unitId, id);
    const { businessLicenseFile, attachmentFiles } = await this.resolveFiles(
      dto.businessLicenseFileId,
      dto.attachmentFileIds ?? [],
    );
    const depositSettlement = await this.resolveUpdateDepositSettlement(
      contract,
      dto,
    );

    contract.unitId = dto.unitId;
    contract.lessorName = dto.lessorName?.trim() ?? "";
    contract.lessorLicenseCode = dto.lessorLicenseCode?.trim() ?? "";
    contract.lessorContactName = dto.lessorContactName?.trim() ?? "";
    contract.lessorPhone = dto.lessorPhone?.trim() ?? "";
    contract.tenantName = dto.tenantName?.trim() ?? "";
    contract.contactName = dto.contactName?.trim() ?? "";
    contract.tenantPhone = dto.tenantPhone?.trim() ?? "";
    contract.licenseCode = dto.licenseCode?.trim() ?? "";
    contract.startDate = dto.startDate;
    contract.endDate = dto.endDate;
    contract.annualRent = dto.annualRent;
    contract.depositAmount = dto.depositAmount;
    contract.billingFrequency = dto.billingFrequency ?? contract.billingFrequency;
    Object.assign(contract, depositSettlement);
    contract.status = resolveContractStatus(dto.startDate, dto.endDate);
    contract.businessLicenseFileId = businessLicenseFile?.id ?? null;
    contract.businessLicenseFile = businessLicenseFile ?? null;
    contract.attachmentFiles = attachmentFiles;

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Contract);
      const saved = await repository.save(repository.create(contract));
      await this.rentReceivablesService.syncContractSchedules(manager, saved);
      return repository.findOneOrFail({ where: { id: saved.id } });
    });
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.contractsRepository.softDelete(id);
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
    const generatedDate = formatShanghaiDate();
    const buffer = await buildContractDocumentPdf({
      contract,
      unit,
      generatedDate,
    });

    return {
      filename,
      mimeType: "application/pdf",
      buffer,
    };
  }

  private async ensureUnitExists(unitId: string) {
    const unit = await this.unitsRepository.findOne({ where: { id: unitId } });
    if (!unit) {
      throw new BadRequestException("厂房不存在");
    }
    return unit;
  }

  private async validateRange(startDate: string, endDate: string, unitId: string, excludeId?: string) {
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

  private async resolveFiles(businessLicenseFileId?: string, attachmentFileIds: string[] = []) {
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

  private async resolveCreateDepositSettlement(
    dto: CreateContractDto,
    tenantName: string,
  ): Promise<DepositSettlementSnapshot> {
    if (dto.depositSettlementMode === DepositSettlementMode.INITIAL) {
      return this.initialDepositSettlement();
    }
    if (dto.depositSettlementMode === DepositSettlementMode.CARRYOVER) {
      return this.resolveCarryoverDepositSettlement(
        dto.unitId,
        tenantName,
        dto.depositCarryoverAmount,
        dto.depositCarryoverSourceContractId,
      );
    }

    const account = await this.depositsService.getAccount(dto.unitId, tenantName);
    if (!account || toCents(account.heldAmount) <= 0) {
      return this.initialDepositSettlement();
    }

    return {
      depositSettlementMode: DepositSettlementMode.CARRYOVER,
      depositCarryoverAmount: fromCents(toCents(account.heldAmount)),
      depositCarryoverSourceContractId: account.latestContractId,
    };
  }

  private async resolveUpdateDepositSettlement(
    contract: Contract,
    dto: UpdateContractDto,
  ): Promise<DepositSettlementSnapshot> {
    const settlementFieldsChanged =
      (dto.depositSettlementMode !== undefined &&
        dto.depositSettlementMode !== contract.depositSettlementMode) ||
      (dto.depositCarryoverAmount !== undefined &&
        toCents(dto.depositCarryoverAmount) !==
          toCents(contract.depositCarryoverAmount)) ||
      (dto.depositCarryoverSourceContractId !== undefined &&
        dto.depositCarryoverSourceContractId !==
          contract.depositCarryoverSourceContractId);

    if (!settlementFieldsChanged) {
      return {
        depositSettlementMode: contract.depositSettlementMode,
        depositCarryoverAmount: contract.depositCarryoverAmount,
        depositCarryoverSourceContractId:
          contract.depositCarryoverSourceContractId,
      };
    }

    const mode = dto.depositSettlementMode ?? contract.depositSettlementMode;
    if (mode === DepositSettlementMode.INITIAL) {
      return this.initialDepositSettlement();
    }

    return this.resolveCarryoverDepositSettlement(
      dto.unitId,
      dto.tenantName?.trim() ?? "",
      dto.depositCarryoverAmount ?? contract.depositCarryoverAmount,
      dto.depositCarryoverSourceContractId ??
        contract.depositCarryoverSourceContractId ??
        undefined,
    );
  }

  private async resolveCarryoverDepositSettlement(
    unitId: string,
    tenantName: string,
    requestedAmount?: number,
    sourceContractId?: string,
  ): Promise<DepositSettlementSnapshot> {
    const account = sourceContractId
      ? await this.depositsService.getAccount(
          unitId,
          tenantName,
          sourceContractId,
        )
      : await this.depositsService.getAccount(unitId, tenantName);
    if (!account) {
      throw new BadRequestException("未找到可结转的押金账户");
    }

    const availableCents = Math.max(toCents(account.heldAmount), 0);
    const requestedCents =
      requestedAmount === undefined ? availableCents : toCents(requestedAmount);
    if (requestedCents < 0) {
      throw new BadRequestException("结转押金不能小于 0");
    }
    if (requestedCents > availableCents) {
      throw new BadRequestException("结转押金不能超过当前持有押金");
    }

    return {
      depositSettlementMode: DepositSettlementMode.CARRYOVER,
      depositCarryoverAmount: fromCents(requestedCents),
      depositCarryoverSourceContractId:
        sourceContractId ?? account.latestContractId,
    };
  }

  private assertOptionalContractFieldsNotNull(dto: CreateContractDto): void {
    const fields = [
      ["billingFrequency", "收租周期"],
      ["depositSettlementMode", "押金处理方式"],
      ["depositCarryoverAmount", "结转押金金额"],
      ["depositCarryoverSourceContractId", "结转押金来源合同"],
    ] as const;
    const values = dto as unknown as Record<string, unknown>;

    for (const [field, label] of fields) {
      if (values[field] === null) {
        throw new BadRequestException(`${label}不能为 null`);
      }
    }
  }

  private initialDepositSettlement(): DepositSettlementSnapshot {
    return {
      depositSettlementMode: DepositSettlementMode.INITIAL,
      depositCarryoverAmount: 0,
      depositCarryoverSourceContractId: null,
    };
  }
}
