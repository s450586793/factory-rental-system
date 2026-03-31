import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { Contract, ContractStatus } from "../contracts/contract.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";
import { CreateUnitDto, UpdateUnitDto } from "./units.dto";
import { FactoryUnit } from "./factory-unit.entity";

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const EXPIRING_DAYS_THRESHOLD = 45;

function parseIsoDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map((value) => Number(value));
  return Date.UTC(year, month - 1, day);
}

function daysUntil(dateString: string) {
  return Math.floor((parseIsoDate(dateString) - parseIsoDate(today())) / 86400000);
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

    return units.map((unit) => this.serializeUnit(unit));
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
    return this.serializeUnit(unit);
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

  private serializeUnit(unit: FactoryUnit) {
    const activeContract = this.resolveActiveContract(unit.contracts ?? []);
    const status = this.resolveUnitStatus(activeContract);
    const serializedContracts = [...(unit.contracts ?? [])]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((contract) => this.serializeContract(contract));

    return {
      id: unit.id,
      code: unit.code,
      location: unit.location,
      area: unit.area ?? null,
      status,
      activeContract: activeContract
        ? {
            id: activeContract.id,
            tenantName: activeContract.tenantName,
            contactName: activeContract.contactName,
            tenantPhone: activeContract.tenantPhone,
            licenseCode: activeContract.licenseCode,
            startDate: activeContract.startDate,
            endDate: activeContract.endDate,
            annualRent: activeContract.annualRent,
            paidAmount: this.resolvePaidAmount(activeContract),
            outstandingAmount: this.resolveOutstandingAmount(activeContract),
            status: activeContract.status,
          }
        : null,
      contractCount: (unit.contracts ?? []).length,
      meterConfigs: [...(unit.meterConfigs ?? [])].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
      contracts: serializedContracts,
    };
  }

  private serializeContract(contract: Contract) {
    return {
      id: contract.id,
      unitId: contract.unitId,
      tenantName: contract.tenantName,
      contactName: contract.contactName,
      tenantPhone: contract.tenantPhone,
      licenseCode: contract.licenseCode,
      startDate: contract.startDate,
      endDate: contract.endDate,
      annualRent: contract.annualRent,
      paidAmount: this.resolvePaidAmount(contract),
      outstandingAmount: this.resolveOutstandingAmount(contract),
      status: contract.status,
      businessLicenseFileId: contract.businessLicenseFileId,
      businessLicenseFile: contract.businessLicenseFile,
      attachmentFiles: contract.attachmentFiles,
    };
  }

  private resolveActiveContract(contracts: Contract[]) {
    const now = today();
    const activeContracts = contracts.filter(
      (contract) =>
        contract.status === ContractStatus.ACTIVE ||
        (contract.startDate <= now && contract.endDate >= now),
    );

    return activeContracts.sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
  }

  private resolveUnitStatus(activeContract: Contract | null) {
    if (!activeContract) {
      return "vacant" as const;
    }

    return daysUntil(activeContract.endDate) <= EXPIRING_DAYS_THRESHOLD ? "expiring" as const : "occupied" as const;
  }

  private resolvePaidAmount(contract: Contract) {
    return Number(
      (contract.rentPayments ?? [])
        .filter((payment) => payment.deletedAt === null || payment.deletedAt === undefined)
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
        .toFixed(2),
    );
  }

  private resolveOutstandingAmount(contract: Contract) {
    return Number(Math.max(Number(contract.annualRent) - this.resolvePaidAmount(contract), 0).toFixed(2));
  }
}
