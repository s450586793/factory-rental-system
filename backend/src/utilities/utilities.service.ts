import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Contract } from "../contracts/contract.entity";
import { Receipt, ReceiptSourceType, ReceiptStatus } from "../receipts/receipt.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { calculateUtilityCharge, round2 } from "./utility-calculation";
import {
  CreateMeterConfigDto,
  CreateUtilityRecordDto,
  MarkUtilityRecordPaidDto,
  UpdateMeterConfigDto,
  UpdateUtilityRecordDto,
  UtilityRecordListQueryDto,
} from "./utilities.dto";
import { UtilityChargeItem } from "./utility-charge-item.entity";
import { UtilityChargeRecord, UtilityChargeStatus } from "./utility-charge-record.entity";
import { UtilityMeterConfig, UtilityType } from "./utility-meter-config.entity";

function today() {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class UtilitiesService {
  constructor(
    @InjectRepository(UtilityMeterConfig)
    private readonly meterConfigsRepository: Repository<UtilityMeterConfig>,
    @InjectRepository(UtilityChargeRecord)
    private readonly utilityRecordsRepository: Repository<UtilityChargeRecord>,
    @InjectRepository(UtilityChargeItem)
    private readonly utilityItemsRepository: Repository<UtilityChargeItem>,
    @InjectRepository(FactoryUnit)
    private readonly unitsRepository: Repository<FactoryUnit>,
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(Receipt)
    private readonly receiptsRepository: Repository<Receipt>,
  ) {}

  listMeterConfigs(unitId?: string, type?: UtilityType) {
    return this.meterConfigsRepository.find({
      where: {
        ...(unitId ? { unitId } : {}),
        ...(type ? { type } : {}),
      },
      order: {
        type: "ASC",
        name: "ASC",
      },
    });
  }

  async createMeterConfig(dto: CreateMeterConfigDto) {
    await this.ensureUnit(dto.unitId);
    const entity = this.meterConfigsRepository.create({
      ...dto,
      name: dto.name.trim(),
    });
    return this.meterConfigsRepository.save(entity);
  }

  async updateMeterConfig(id: string, dto: UpdateMeterConfigDto) {
    const config = await this.findMeterConfigOrFail(id);
    await this.ensureUnit(dto.unitId);
    Object.assign(config, {
      ...dto,
      name: dto.name.trim(),
    });
    return this.meterConfigsRepository.save(config);
  }

  async removeMeterConfig(id: string) {
    await this.findMeterConfigOrFail(id);
    await this.meterConfigsRepository.softDelete(id);
    return { success: true };
  }

  async getPrefill(unitId: string, type: UtilityType) {
    await this.ensureUnit(unitId);
    const meterConfigs = await this.meterConfigsRepository.find({
      where: { unitId, type, enabled: true },
      order: { name: "ASC" },
    });
    const records = await this.utilityRecordsRepository.find({
      where: { unitId, type },
      order: {
        currentReadAt: "DESC",
        createdAt: "DESC",
      },
    });

    const meters = meterConfigs.map((config) => {
      const latestItem = records
        .flatMap((record) =>
          record.items
            .filter((item) => item.meterConfigId === config.id)
            .map((item) => ({ item, record })),
        )[0];

      return {
        meterConfigId: config.id,
        name: config.name,
        multiplier: config.multiplier,
        unitPrice: config.unitPrice,
        lineLossPercent: config.lineLossPercent,
        previousReading: latestItem?.item.currentReading ?? config.initialReading,
        previousReadAt: latestItem?.record.currentReadAt ?? "",
      };
    });

    return {
      unitId,
      type,
      meters,
    };
  }

  listRecords(query: UtilityRecordListQueryDto) {
    return this.utilityRecordsRepository.find({
      where: {
        ...(query.unitId ? { unitId: query.unitId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: {
        recordedAt: "DESC",
        createdAt: "DESC",
      },
    });
  }

  async findRecordOrFail(id: string) {
    const record = await this.utilityRecordsRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException("水电收费记录不存在");
    }
    return record;
  }

  createRecord(dto: CreateUtilityRecordDto) {
    return this.saveRecord(dto);
  }

  updateRecord(id: string, dto: UpdateUtilityRecordDto) {
    return this.saveRecord(dto, id);
  }

  async markAsPaid(id: string, dto: MarkUtilityRecordPaidDto) {
    const record = await this.findRecordOrFail(id);
    record.status = UtilityChargeStatus.PAID;
    record.paidAt = dto.paidAt ?? today();
    record.paymentMethod = dto.paymentMethod?.trim() ?? null;
    return this.utilityRecordsRepository.save(record);
  }

  async removeRecord(id: string) {
    await this.findRecordOrFail(id);
    await this.ensureNoActiveReceipt(ReceiptSourceType.UTILITY, id);
    await this.utilityRecordsRepository.softDelete(id);
    return { success: true };
  }

  private async saveRecord(dto: CreateUtilityRecordDto | UpdateUtilityRecordDto, id?: string) {
    if (dto.currentReadAt < dto.previousReadAt) {
      throw new BadRequestException("本次抄表日期不能早于上次抄表日期");
    }

    await this.ensureUnit(dto.unitId);
    const contract = await this.ensureContract(dto.contractId, dto.unitId);
    const meterConfigs = await this.meterConfigsRepository.findBy({
      id: In(dto.items.map((item) => item.meterConfigId)),
    });

    if (meterConfigs.length !== dto.items.length) {
      throw new BadRequestException("部分表计配置不存在");
    }

    meterConfigs.forEach((config) => {
      if (config.unitId !== dto.unitId || config.type !== dto.type) {
        throw new BadRequestException("表计配置与厂房或费用类型不匹配");
      }
    });

    const items = dto.items.map((input) => {
      const config = meterConfigs.find((meter) => meter.id === input.meterConfigId)!;
      if (input.currentReading < input.previousReading) {
        throw new BadRequestException(`表计 ${config.name} 的本次读数不能小于上次读数`);
      }

      const calculation = calculateUtilityCharge({
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        multiplier: config.multiplier,
        unitPrice: config.unitPrice,
        lineLossPercent: config.lineLossPercent,
      });

      return {
        meterConfigId: config.id,
        meterConfig: config,
        meterNameSnapshot: config.name,
        multiplierSnapshot: config.multiplier,
        unitPriceSnapshot: config.unitPrice,
        lineLossPercentSnapshot: config.lineLossPercent,
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        usage: calculation.usage,
        adjustedUsage: calculation.adjustedUsage,
        amount: calculation.amount,
      };
    });

    const totalUsage = round2(items.reduce((sum, item) => sum + item.usage, 0));
    const adjustedUsage = round2(items.reduce((sum, item) => sum + item.adjustedUsage, 0));
    const amount = round2(items.reduce((sum, item) => sum + item.amount, 0));

    let record: UtilityChargeRecord;
    if (id) {
      record = await this.findRecordOrFail(id);
      await this.ensureNoActiveReceipt(ReceiptSourceType.UTILITY, id);
      await this.utilityItemsRepository.delete({ recordId: id });
      record.items = [];
    } else {
      record = this.utilityRecordsRepository.create();
      record.recordedAt = today();
      record.status = UtilityChargeStatus.UNPAID;
      record.paidAt = null;
    }

    record.unitId = dto.unitId;
    record.contractId = contract.id;
    record.contract = contract;
    record.tenantNameSnapshot = contract.tenantName;
    record.tenantPhoneSnapshot = contract.tenantPhone;
    record.type = dto.type;
    record.previousReadAt = dto.previousReadAt;
    record.currentReadAt = dto.currentReadAt;
    record.totalUsage = totalUsage;
    record.adjustedUsage = adjustedUsage;
    record.amount = amount;
    record.paymentMethod = dto.paymentMethod?.trim() ?? record.paymentMethod ?? null;
    record.note = dto.note?.trim() ?? null;
    record.items = items.map((item) => {
      const entity = new UtilityChargeItem();
      Object.assign(entity, item);
      return entity;
    });

    return this.utilityRecordsRepository.save(record);
  }

  private async ensureUnit(id: string) {
    const unit = await this.unitsRepository.findOne({ where: { id } });
    if (!unit) {
      throw new BadRequestException("厂房不存在");
    }
    return unit;
  }

  private async ensureContract(contractId: string, unitId: string) {
    const contract = await this.contractsRepository.findOne({ where: { id: contractId } });
    if (!contract) {
      throw new BadRequestException("合同不存在");
    }
    if (contract.unitId !== unitId) {
      throw new BadRequestException("所选合同不属于当前厂房");
    }
    return contract;
  }

  private async findMeterConfigOrFail(id: string) {
    const config = await this.meterConfigsRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException("表计配置不存在");
    }
    return config;
  }

  private async ensureNoActiveReceipt(sourceType: ReceiptSourceType, sourceId: string) {
    const receipt = await this.receiptsRepository.findOne({
      where: {
        sourceType,
        sourceId,
        status: ReceiptStatus.ACTIVE,
      },
    });
    if (receipt) {
      throw new BadRequestException("该记录已经开具收据，不能再修改或删除");
    }
  }
}
