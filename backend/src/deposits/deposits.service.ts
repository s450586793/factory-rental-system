import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { fromCents, toCents } from "../common/money/cents";
import { Contract } from "../contracts/contract.entity";
import { FilesService } from "../files/files.service";
import {
  CreateDepositRecordDto,
  DepositAccountSummary,
  ListDepositAccountsQueryDto,
  UpdateDepositRecordDto,
} from "./deposits.dto";
import { DepositRecord, DepositRecordType } from "./deposit-record.entity";

type DepositAccountGroup = {
  unitId: string;
  unit: DepositAccountSummary["unit"];
  tenantName: string;
  deposits: DepositRecord[];
};

export function normalizeDepositTenantName(value: string): string {
  return value.trim();
}

@Injectable()
export class DepositsService {
  constructor(
    @InjectRepository(DepositRecord)
    private readonly depositsRepository: Repository<DepositRecord>,
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    private readonly filesService: FilesService,
  ) {}

  list() {
    return this.depositsRepository.find({
      order: {
        paymentDate: "DESC",
        createdAt: "DESC",
      },
    });
  }

  async listAccounts(query: ListDepositAccountsQueryDto): Promise<DepositAccountSummary[]> {
    const normalizedTenantName = query.tenantName === undefined
      ? undefined
      : normalizeDepositTenantName(query.tenantName);
    if (query.tenantName !== undefined && !normalizedTenantName) {
      return [];
    }

    const where = query.unitId ? { unitId: query.unitId } : {};
    const [deposits, contracts] = await Promise.all([
      this.depositsRepository.find({ where }),
      this.contractsRepository.find({ where }),
    ]);
    const groups = new Map<string, DepositAccountGroup>();

    deposits.forEach((deposit) => {
      const tenantName = normalizeDepositTenantName(deposit.tenantNameSnapshot);
      if (
        deposit.deletedAt ||
        !tenantName ||
        (query.unitId && deposit.unitId !== query.unitId) ||
        (normalizedTenantName && tenantName !== normalizedTenantName)
      ) {
        return;
      }

      const key = this.buildAccountKey(deposit.unitId, tenantName);
      const group = groups.get(key) ?? {
        unitId: deposit.unitId,
        unit: deposit.unit,
        tenantName,
        deposits: [],
      };
      group.deposits.push(deposit);
      groups.set(key, group);
    });

    return [...groups.values()]
      .map((group) => this.buildAccountSummary(group, contracts))
      .sort(
        (left, right) =>
          left.unit.code.localeCompare(right.unit.code) || left.tenantName.localeCompare(right.tenantName),
      );
  }

  async getAccount(
    unitId: string,
    tenantName: string,
    sourceContractId?: string,
  ): Promise<DepositAccountSummary | null> {
    let normalizedTenantName = normalizeDepositTenantName(tenantName);

    if (sourceContractId) {
      const sourceContract = await this.contractsRepository.findOne({
        where: { id: sourceContractId },
      });
      if (!sourceContract || sourceContract.deletedAt || sourceContract.unitId !== unitId) {
        return null;
      }
      normalizedTenantName = normalizeDepositTenantName(sourceContract.tenantName);
    }

    if (!normalizedTenantName) {
      return null;
    }

    const accounts = await this.listAccounts({ unitId, tenantName: normalizedTenantName });
    return accounts[0] ?? null;
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
    const attachmentFiles = await this.filesService.resolvePaymentVoucherFiles(dto.attachmentFileIds ?? []);

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
    deposit.attachmentFiles = attachmentFiles;

    return this.depositsRepository.save(deposit);
  }

  private buildAccountSummary(
    group: DepositAccountGroup,
    contracts: Contract[],
  ): DepositAccountSummary {
    const latestContract = contracts
      .filter(
        (contract) =>
          !contract.deletedAt &&
          contract.unitId === group.unitId &&
          normalizeDepositTenantName(contract.tenantName) === group.tenantName,
      )
      .sort(
        (left, right) =>
          right.startDate.localeCompare(left.startDate) || right.id.localeCompare(left.id),
      )[0] ?? null;
    const heldCents = group.deposits.reduce(
      (sum, deposit) =>
        sum + (deposit.type === DepositRecordType.RECEIVED ? toCents(deposit.amount) : -toCents(deposit.amount)),
      0,
    );
    const agreedDepositCents = toCents(latestContract?.depositAmount ?? 0);

    return {
      unitId: group.unitId,
      unit: group.unit,
      tenantName: group.tenantName,
      agreedDepositAmount: fromCents(agreedDepositCents),
      heldAmount: fromCents(heldCents),
      supplementAmount: fromCents(Math.max(agreedDepositCents - heldCents, 0)),
      refundAmount: fromCents(Math.max(heldCents - agreedDepositCents, 0)),
      latestContractId: latestContract?.id ?? null,
      lastTransactionDate: group.deposits
        .map((deposit) => deposit.paymentDate)
        .sort((left, right) => right.localeCompare(left))[0] ?? null,
    };
  }

  private buildAccountKey(unitId: string, tenantName: string) {
    return `${unitId}\u0000${tenantName}`;
  }
}
