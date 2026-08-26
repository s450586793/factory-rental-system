import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  Repository,
} from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { fromCents, toCents } from "../common/money/cents";
import { Contract } from "../contracts/contract.entity";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { allocateRentPayments, RentAllocationResult } from "./rent-allocation";
import { RentPaymentAllocation } from "./rent-payment-allocation.entity";
import { RentReceivableSchedule } from "./rent-receivable-schedule.entity";
import {
  ListRentReceivablesQueryDto,
  RentContractFinancialSummary,
  RentReceivableStatus,
  UpdateRentReceivableDto,
} from "./rent-receivables.dto";
import { buildRentSchedule } from "./rent-schedule";

const PROTECTED_SCHEDULE_ERROR =
  "合同修改会改变已到期或已收款期次，请先核对合同日期和收租周期";
const INVALID_DUE_DATE_ERROR = "应收日期必须是有效的 YYYY-MM-DD 日期";
const DATE_ONLY_PATTERN = /^(?!0000)(\d{4})-(\d{2})-(\d{2})$/;

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function activeAllocatedAmount(schedule: RentReceivableSchedule): number {
  return fromCents(
    (schedule.allocations ?? [])
      .filter((allocation) => allocation.deletedAt == null)
      .reduce(
        (sum, allocation) => sum + toCents(allocation.allocatedAmount),
        0,
      ),
  );
}

function emptySummary(): RentContractFinancialSummary {
  return {
    dueReceivableAmount: 0,
    duePaidAmount: 0,
    outstandingAmount: 0,
    prepaidAmount: 0,
    unallocatedAmount: 0,
  };
}

@Injectable()
export class RentReceivablesService {
  constructor(
    @InjectRepository(RentReceivableSchedule)
    private readonly schedulesRepository: Repository<RentReceivableSchedule>,
    @InjectRepository(RentPayment)
    private readonly paymentsRepository: Repository<RentPayment>,
    private readonly dataSource: DataSource,
  ) {}

  async syncContractSchedules(
    manager: EntityManager,
    contract: Contract,
  ): Promise<void> {
    const schedulesRepository = manager.getRepository(
      RentReceivableSchedule,
    );
    const existingSchedules = await schedulesRepository.find({
      where: { contractId: contract.id },
      relations: { allocations: true },
      order: { dueDate: "ASC", sequence: "ASC" },
    });
    let generatedSchedules: ReturnType<typeof buildRentSchedule>;
    try {
      generatedSchedules = buildRentSchedule(contract);
    } catch (error) {
      const message = error instanceof Error ? error.message : "合同应收计划无效";
      const safeMessages = new Set([
        "合同结束日期不能早于开始日期",
        "年租金必须大于 0",
        "日期格式无效",
      ]);
      throw new BadRequestException(
        safeMessages.has(message) ? message : "合同应收计划无效",
      );
    }
    const currentDate = formatShanghaiDate();
    const protectedSchedules = existingSchedules.filter(
      (item) =>
        item.dueDate <= currentDate || activeAllocatedAmount(item) > 0,
    );

    for (const protectedSchedule of protectedSchedules) {
      const generated = generatedSchedules.find(
        (item) => item.sequence === protectedSchedule.sequence,
      );
      if (
        !generated ||
        generated.periodStart !== protectedSchedule.periodStart ||
        generated.periodEnd !== protectedSchedule.periodEnd ||
        generated.dueDate !== protectedSchedule.dueDate
      ) {
        throw new BadRequestException(PROTECTED_SCHEDULE_ERROR);
      }
    }

    const protectedSequences = new Set(
      protectedSchedules.map((item) => item.sequence),
    );
    const replaceableIds = existingSchedules
      .filter((item) => !protectedSequences.has(item.sequence))
      .map((item) => item.id);
    if (replaceableIds.length > 0) {
      await schedulesRepository.delete({ id: In(replaceableIds) });
    }

    const replacements = generatedSchedules
      .filter((item) => !protectedSequences.has(item.sequence))
      .map((item) =>
        schedulesRepository.create({
          ...item,
          contractId: contract.id,
          contract,
        }),
      );
    if (replacements.length > 0) {
      await schedulesRepository.save(replacements);
    }

    await this.rebuildPaymentAllocations(manager, contract.id);
  }

  async rebuildPaymentAllocations(
    manager: EntityManager,
    contractId: string,
  ): Promise<RentAllocationResult> {
    const schedules = await manager
      .getRepository(RentReceivableSchedule)
      .find({
        where: { contractId },
        order: { dueDate: "ASC", sequence: "ASC" },
      });
    const payments = await manager.getRepository(RentPayment).find({
      where: { contractId },
      order: { paymentDate: "ASC", id: "ASC" },
    });
    const result = allocateRentPayments(schedules, payments);
    const allocationsRepository = manager.getRepository(
      RentPaymentAllocation,
    );
    await allocationsRepository.delete({
      rentReceivableScheduleId: In(schedules.map((item) => item.id)),
    });
    if (result.allocations.length > 0) {
      await allocationsRepository.save(result.allocations);
    }
    return result;
  }

  async list(query: ListRentReceivablesQueryDto) {
    const schedules = await this.schedulesRepository.find({
      where: this.activeContractWhere(query),
      relations: { contract: true, allocations: true },
      order: { dueDate: "ASC", sequence: "ASC" },
    });
    const items = schedules
      .map((item) => this.serializeSchedule(item))
      .filter(
        (item) =>
          (query.year === undefined ||
            Number(item.dueDate.slice(0, 4)) === query.year) &&
          (query.status === undefined || item.status === query.status),
      );

    return { items };
  }

  async findOneOrFail(id: string) {
    const schedule = await this.schedulesRepository.findOne({
      where: {
        id,
        contract: { deletedAt: IsNull() },
      },
      relations: { contract: true, allocations: true },
    });
    if (!schedule) {
      throw new NotFoundException("应收计划不存在");
    }
    return this.serializeSchedule(schedule);
  }

  async update(id: string, dto: UpdateRentReceivableDto) {
    if (dto.dueDate !== undefined && !isValidDateOnly(dto.dueDate)) {
      throw new BadRequestException(INVALID_DUE_DATE_ERROR);
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const schedulesRepository = manager.getRepository(
          RentReceivableSchedule,
        );
        const schedule = await schedulesRepository.findOne({
          where: {
            id,
            contract: { deletedAt: IsNull() },
          },
          relations: { contract: true, allocations: true },
        });
        if (!schedule) {
          throw new NotFoundException("应收计划不存在");
        }
        if (schedule.dueDate <= formatShanghaiDate()) {
          throw new BadRequestException("已到期应收计划不能修改");
        }

        const allocatedAmount = activeAllocatedAmount(schedule);
        if (
          dto.receivableAmount !== undefined &&
          dto.receivableAmount <= 0
        ) {
          throw new BadRequestException("应收金额必须大于 0");
        }
        if (
          dto.receivableAmount !== undefined &&
          toCents(dto.receivableAmount) < toCents(allocatedAmount)
        ) {
          throw new BadRequestException("应收金额不能低于已分配金额");
        }
        if (allocatedAmount > 0) {
          throw new BadRequestException("已有收款分配的应收计划不能修改");
        }

        if (dto.dueDate !== undefined) {
          schedule.dueDate = dto.dueDate;
        }
        if (dto.receivableAmount !== undefined) {
          schedule.receivableAmount = dto.receivableAmount;
        }
        await schedulesRepository.save(schedule);
        await this.rebuildPaymentAllocations(manager, schedule.contractId);
        const reloaded = await schedulesRepository.findOne({
          where: {
            id,
            contract: { deletedAt: IsNull() },
          },
          relations: { contract: true, allocations: true },
        });
        if (!reloaded) {
          throw new NotFoundException("应收计划不存在");
        }
        return this.serializeSchedule(reloaded);
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException("应收计划更新失败");
    }
  }

  async getContractSummaries(
    contractIds: string[],
    asOfDate = formatShanghaiDate(),
  ): Promise<Map<string, RentContractFinancialSummary>> {
    const uniqueContractIds = [...new Set(contractIds)];
    const summaries = new Map(
      uniqueContractIds.map((contractId) => [contractId, emptySummary()]),
    );
    if (uniqueContractIds.length === 0) {
      return summaries;
    }

    const [schedules, payments] = await Promise.all([
      this.schedulesRepository.find({
        where: {
          contractId: In(uniqueContractIds),
          contract: { deletedAt: IsNull() },
        },
        relations: { contract: true, allocations: true },
        order: { dueDate: "ASC", sequence: "ASC" },
      }),
      this.paymentsRepository.find({
        where: {
          contractId: In(uniqueContractIds),
          contract: { deletedAt: IsNull() },
        },
      }),
    ]);

    const allocatedCentsByContract = new Map<string, number>();
    for (const schedule of schedules) {
      const summary = summaries.get(schedule.contractId);
      if (!summary) {
        continue;
      }
      const receivableCents = toCents(schedule.receivableAmount);
      const allocatedCents = toCents(activeAllocatedAmount(schedule));
      allocatedCentsByContract.set(
        schedule.contractId,
        (allocatedCentsByContract.get(schedule.contractId) ?? 0) +
          allocatedCents,
      );

      if (schedule.dueDate <= asOfDate) {
        summary.dueReceivableAmount = fromCents(
          toCents(summary.dueReceivableAmount) + receivableCents,
        );
        summary.duePaidAmount = fromCents(
          toCents(summary.duePaidAmount) +
            Math.min(receivableCents, allocatedCents),
        );
      } else {
        summary.prepaidAmount = fromCents(
          toCents(summary.prepaidAmount) + allocatedCents,
        );
      }
    }

    const paymentCentsByContract = new Map<string, number>();
    for (const payment of payments) {
      paymentCentsByContract.set(
        payment.contractId,
        (paymentCentsByContract.get(payment.contractId) ?? 0) +
          toCents(payment.amount),
      );
    }

    for (const [contractId, summary] of summaries) {
      summary.outstandingAmount = fromCents(
        Math.max(
          toCents(summary.dueReceivableAmount) -
            toCents(summary.duePaidAmount),
          0,
        ),
      );
      summary.unallocatedAmount = fromCents(
        Math.max(
          (paymentCentsByContract.get(contractId) ?? 0) -
            (allocatedCentsByContract.get(contractId) ?? 0),
          0,
        ),
      );
    }

    return summaries;
  }

  private activeContractWhere(
    query: ListRentReceivablesQueryDto,
  ): FindOptionsWhere<RentReceivableSchedule> {
    return {
      ...(query.contractId ? { contractId: query.contractId } : {}),
      contract: {
        deletedAt: IsNull(),
        ...(query.unitId ? { unitId: query.unitId } : {}),
        ...(query.tenantName?.trim()
          ? { tenantName: ILike(`%${query.tenantName.trim()}%`) }
          : {}),
      },
    };
  }

  private serializeSchedule(schedule: RentReceivableSchedule) {
    const currentDate = formatShanghaiDate();
    const receivableCents = toCents(schedule.receivableAmount);
    const paidCents = toCents(activeAllocatedAmount(schedule));
    const isDue = schedule.dueDate <= currentDate;
    const duePaidCents = isDue ? Math.min(paidCents, receivableCents) : 0;
    const outstandingCents = isDue
      ? Math.max(receivableCents - duePaidCents, 0)
      : 0;
    const prepaidCents = isDue ? 0 : paidCents;
    let status: RentReceivableStatus;

    if (isDue) {
      status =
        outstandingCents === 0
          ? RentReceivableStatus.SETTLED
          : RentReceivableStatus.OVERDUE;
    } else if (paidCents === 0) {
      status = RentReceivableStatus.NOT_DUE;
    } else if (paidCents < receivableCents) {
      status = RentReceivableStatus.PARTIALLY_PREPAID;
    } else {
      status = RentReceivableStatus.PREPAID;
    }

    return {
      ...schedule,
      paidAmount: fromCents(paidCents),
      dueReceivableAmount: isDue ? fromCents(receivableCents) : 0,
      duePaidAmount: fromCents(duePaidCents),
      outstandingAmount: fromCents(outstandingCents),
      prepaidAmount: fromCents(prepaidCents),
      status,
    };
  }
}
