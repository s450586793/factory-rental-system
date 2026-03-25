import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Contract } from "../contracts/contract.entity";
import { CreateDepositRecordDto, UpdateDepositRecordDto } from "./deposits.dto";
import { DepositRecord } from "./deposit-record.entity";

@Injectable()
export class DepositsService {
  constructor(
    @InjectRepository(DepositRecord)
    private readonly depositsRepository: Repository<DepositRecord>,
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
  ) {}

  list() {
    return this.depositsRepository.find({
      order: {
        paymentDate: "DESC",
        createdAt: "DESC",
      },
    });
  }

  async findOneOrFail(id: string) {
    const deposit = await this.depositsRepository.findOne({ where: { id } });
    if (!deposit) {
      throw new NotFoundException("押金记录不存在");
    }
    return deposit;
  }

  create(dto: CreateDepositRecordDto) {
    return this.save(dto);
  }

  update(id: string, dto: UpdateDepositRecordDto) {
    return this.save(dto, id);
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.depositsRepository.softDelete(id);
    return { success: true };
  }

  private async save(dto: CreateDepositRecordDto | UpdateDepositRecordDto, id?: string) {
    const contract = await this.contractsRepository.findOne({ where: { id: dto.contractId } });
    if (!contract) {
      throw new BadRequestException("合同不存在");
    }

    let deposit: DepositRecord;
    if (id) {
      deposit = await this.findOneOrFail(id);
    } else {
      deposit = this.depositsRepository.create();
    }

    deposit.contractId = contract.id;
    deposit.contract = contract;
    deposit.unitId = contract.unitId;
    deposit.tenantNameSnapshot = contract.tenantName;
    deposit.type = dto.type;
    deposit.paymentDate = dto.paymentDate;
    deposit.amount = dto.amount;
    deposit.method = dto.method.trim();
    deposit.note = dto.note?.trim() ?? null;

    return this.depositsRepository.save(deposit);
  }
}
