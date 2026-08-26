import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { Contract, ContractStatus } from "../contracts/contract.entity";
import { RentContractFinancialSummary } from "../rent-receivables/rent-receivables.dto";
import { RentReceivablesService } from "../rent-receivables/rent-receivables.service";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";
import { CreateUnitDto, UpdateUnitDto } from "./units.dto";
import { FactoryUnit } from "./factory-unit.entity";

function today() {
  return formatShanghaiDate();
}

const EXPIRING_DAYS_THRESHOLD = 45;
const EMPTY_FINANCIAL_SUMMARY: RentContractFinancialSummary = {
  dueReceivableAmount: 0,
  duePaidAmount: 0,
  outstandingAmount: 0,
  prepaidAmount: 0,
  unallocatedAmount: 0,
};

function parseIsoDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map((value) => Number(value));
  return Date.UTC(year, month - 1, day);
}

function daysUntil(dateString: string) {
  return Math.floor((parseIsoDate(dateString) - parseIsoDate(today())) / 86400000);
}

function resolveContractStatus(startDate: string, endDate: string) {
  const currentDate = today();
  if (startDate > currentDate) {
    return ContractStatus.FUTURE;
  }
  if (endDate < currentDate) {
    return ContractStatus.EXPIRED;
  }
  return ContractStatus.ACTIVE;
}

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(FactoryUnit)
    private readonly unitsRepository: Repository<FactoryUnit>,
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(UtilityMeterConfig)
    private readonly meterConfigsRepository: Repository<UtilityMeterConfig>,
    private readonly rentReceivablesService: RentReceivablesService,
  ) {}

  async list() {
    const units = await this.unitsRepository.find({
      relations: {
        contracts: {
          rentPayments: true,
        },
        meterConfigs: true,
      },
      order: {
        code: "ASC",
      },
    });

    const summaries = await this.getContractSummaries(units);
    return units.map((unit) => this.serializeUnit(unit, summaries));
  }

  async findOneOrFail(id: string) {
    const unit = await this.unitsRepository.findOne({
      where: { id },
      relations: {
        contracts: {
          rentPayments: true,
        },
        meterConfigs: true,
      },
    });

    if (!unit) {
      throw new NotFoundException("厂房不存在");
    }

    return unit;
  }

  async getDetail(id: string) {
    const unit = await this.findOneOrFail(id);
    const summaries = await this.getContractSummaries([unit]);
    return this.serializeUnit(unit, summaries);
  }

  async create(dto: CreateUnitDto) {
    await this.ensureCodeAvailable(dto.code);
    const entity = this.unitsRepository.create({
      code: dto.code.trim(),
      location: dto.location.trim(),
      area: dto.area ?? null,
    });
    const created = await this.saveUnitEntity(entity);
    return this.getDetail(created.id);
  }

  async update(id: string, dto: UpdateUnitDto) {
    const unit = await this.findOneOrFail(id);
    if (unit.code !== dto.code.trim()) {
      await this.ensureCodeAvailable(dto.code, id);
    }

    unit.code = dto.code.trim();
    unit.location = dto.location.trim();
    unit.area = dto.area ?? null;
    await this.saveUnitEntity(unit);
    return this.getDetail(id);
  }

  async remove(id: string) {
    const unit = await this.findOneOrFail(id);
    const contractCount = await this.contractsRepository.count({ where: { unitId: unit.id } });
    const meterCount = await this.meterConfigsRepository.count({ where: { unitId: unit.id } });

    if (contractCount > 0 || meterCount > 0) {
      throw new BadRequestException("该厂房已有合同或表计配置，无法直接删除");
    }

    await this.unitsRepository.softDelete(id);
    return { success: true };
  }

  private async ensureCodeAvailable(code: string, excludeId?: string) {
    const existing = await this.unitsRepository.findOne({
      where: {
        code: code.trim(),
      },
    });

    if (existing && existing.id !== excludeId) {
      throw new BadRequestException("厂房编号已存在");
    }
  }

  private async saveUnitEntity(unit: FactoryUnit) {
    try {
      return await this.unitsRepository.save(unit);
    } catch (error) {
      if (this.isUniqueCodeViolation(error)) {
        throw new BadRequestException("厂房编号已存在");
      }
      throw error;
    }
  }

  private isUniqueCodeViolation(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
    return (
      driverError?.code === "23505" &&
      (driverError.constraint === "IDX_factory_units_code" || driverError.constraint === "factory_units_code_key")
    );
  }

  private async getContractSummaries(units: FactoryUnit[]) {
    return this.rentReceivablesService.getContractSummaries(
      units.flatMap((unit) =>
        (unit.contracts ?? []).map((contract) => contract.id),
      ),
    );
  }

  private serializeUnit(
    unit: FactoryUnit,
    summaries: Map<string, RentContractFinancialSummary>,
  ) {
    const contracts = unit.contracts ?? [];
    const activeContract = this.resolveActiveContract(contracts);
    const status = this.resolveUnitStatus(contracts, activeContract);
    const serializedContracts = [...(unit.contracts ?? [])]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((contract) =>
        this.serializeContract(
          contract,
          this.resolveFinancialSummary(contract, summaries),
        ),
      );

    return {
      id: unit.id,
      code: unit.code,
      location: unit.location,
      area: unit.area ?? null,
      status,
      activeContract: activeContract
        ? this.serializeContract(
            activeContract,
            this.resolveFinancialSummary(activeContract, summaries),
          )
        : null,
      contractCount: (unit.contracts ?? []).length,
      meterConfigs: [...(unit.meterConfigs ?? [])].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
      contracts: serializedContracts,
    };
  }

  private serializeContract(
    contract: Contract,
    summary: RentContractFinancialSummary,
  ) {
    return {
      id: contract.id,
      unitId: contract.unitId,
      lessorName: contract.lessorName,
      lessorLicenseCode: contract.lessorLicenseCode,
      lessorContactName: contract.lessorContactName,
      lessorPhone: contract.lessorPhone,
      tenantName: contract.tenantName,
      contactName: contract.contactName,
      tenantPhone: contract.tenantPhone,
      licenseCode: contract.licenseCode,
      startDate: contract.startDate,
      endDate: contract.endDate,
      annualRent: contract.annualRent,
      depositAmount: contract.depositAmount,
      billingFrequency: contract.billingFrequency,
      depositSettlementMode: contract.depositSettlementMode,
      depositCarryoverAmount: contract.depositCarryoverAmount,
      depositCarryoverSourceContractId:
        contract.depositCarryoverSourceContractId,
      ...summary,
      status: resolveContractStatus(contract.startDate, contract.endDate),
      businessLicenseFileId: contract.businessLicenseFileId,
      businessLicenseFile: contract.businessLicenseFile,
      attachmentFiles: contract.attachmentFiles,
    };
  }

  private resolveActiveContract(contracts: Contract[]) {
    const now = today();
    const activeContracts = contracts.filter((contract) => contract.startDate <= now && contract.endDate >= now);

    return activeContracts.sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
  }

  private resolveUnitStatus(contracts: Contract[], activeContract: Contract | null) {
    if (!activeContract) {
      const hasExpiredContract = contracts.some((contract) => contract.endDate < today());
      return hasExpiredContract ? "expired" as const : "vacant" as const;
    }

    return daysUntil(activeContract.endDate) <= EXPIRING_DAYS_THRESHOLD ? "expiring" as const : "occupied" as const;
  }

  private resolveFinancialSummary(
    contract: Contract,
    summaries: Map<string, RentContractFinancialSummary>,
  ) {
    return summaries.get(contract.id) ?? EMPTY_FINANCIAL_SUMMARY;
  }
}
