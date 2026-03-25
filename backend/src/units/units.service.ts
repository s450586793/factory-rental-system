import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Contract, ContractStatus } from "../contracts/contract.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";
import { CreateUnitDto, UpdateUnitDto } from "./units.dto";
import { FactoryUnit } from "./factory-unit.entity";

function today() {
  return new Date().toISOString().slice(0, 10);
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
        contracts: true,
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
        contracts: true,
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
    });
    const created = await this.unitsRepository.save(entity);
    return this.getDetail(created.id);
  }

  async update(id: string, dto: UpdateUnitDto) {
    const unit = await this.findOneOrFail(id);
    if (unit.code !== dto.code.trim()) {
      await this.ensureCodeAvailable(dto.code, id);
    }

    unit.code = dto.code.trim();
    unit.location = dto.location.trim();
    await this.unitsRepository.save(unit);
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

  private serializeUnit(unit: FactoryUnit) {
    const activeContract = this.resolveActiveContract(unit.contracts ?? []);
    return {
      id: unit.id,
      code: unit.code,
      location: unit.location,
      status: activeContract ? "occupied" : "vacant",
      activeContract: activeContract
        ? {
            id: activeContract.id,
            tenantName: activeContract.tenantName,
            tenantPhone: activeContract.tenantPhone,
            startDate: activeContract.startDate,
            endDate: activeContract.endDate,
            annualRent: activeContract.annualRent,
            status: activeContract.status,
          }
        : null,
      contractCount: (unit.contracts ?? []).length,
      meterConfigs: [...(unit.meterConfigs ?? [])].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
      contracts: [...(unit.contracts ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
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
}
