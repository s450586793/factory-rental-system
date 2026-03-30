import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { FilesService } from "../files/files.service";
import { FactoryUnit } from "../units/factory-unit.entity";
import { Contract, ContractStatus } from "./contract.entity";
import { CreateContractDto, UpdateContractDto } from "./contracts.dto";

function resolveContractStatus(startDate: string, endDate: string) {
  const today = new Date().toISOString().slice(0, 10);
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
    await this.ensureUnitExists(dto.unitId);
    await this.validateRange(dto.startDate, dto.endDate, dto.unitId);
    const { businessLicenseFile, attachmentFiles } = await this.resolveFiles(
      dto.businessLicenseFileId,
      dto.attachmentFileIds ?? [],
    );
    const entity = this.contractsRepository.create({
      unitId: dto.unitId,
      tenantName: dto.tenantName.trim(),
      contactName: dto.contactName?.trim() ?? "",
      tenantPhone: dto.tenantPhone?.trim() ?? "",
      licenseCode: dto.licenseCode?.trim() ?? "",
      startDate: dto.startDate,
      endDate: dto.endDate,
      annualRent: dto.annualRent,
      status: resolveContractStatus(dto.startDate, dto.endDate),
      businessLicenseFileId: businessLicenseFile?.id ?? null,
      businessLicenseFile,
      attachmentFiles,
    });
    return this.contractsRepository.save(entity);
  }

  async update(id: string, dto: UpdateContractDto) {
    const contract = await this.findOneOrFail(id);
    await this.ensureUnitExists(dto.unitId);
    await this.validateRange(dto.startDate, dto.endDate, dto.unitId, id);
    const { businessLicenseFile, attachmentFiles } = await this.resolveFiles(
      dto.businessLicenseFileId,
      dto.attachmentFileIds ?? [],
    );

    contract.unitId = dto.unitId;
    contract.tenantName = dto.tenantName.trim();
    contract.contactName = dto.contactName?.trim() ?? "";
    contract.tenantPhone = dto.tenantPhone?.trim() ?? "";
    contract.licenseCode = dto.licenseCode?.trim() ?? "";
    contract.startDate = dto.startDate;
    contract.endDate = dto.endDate;
    contract.annualRent = dto.annualRent;
    contract.status = resolveContractStatus(dto.startDate, dto.endDate);
    contract.businessLicenseFileId = businessLicenseFile?.id ?? null;
    contract.businessLicenseFile = businessLicenseFile ?? null;
    contract.attachmentFiles = attachmentFiles;

    return this.contractsRepository.save(contract);
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.contractsRepository.softDelete(id);
    return { success: true };
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
}
