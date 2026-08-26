import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
import { Contract } from "../contracts/contract.entity";
import { FilesService } from "../files/files.service";
import {
  Receipt,
  ReceiptSourceType,
  ReceiptStatus,
} from "../receipts/receipt.entity";
import {
  allocateRentPayments,
  RentAllocationResult,
} from "../rent-receivables/rent-allocation";
import { RentReceivableSchedule } from "../rent-receivables/rent-receivable-schedule.entity";
import { RentReceivablesService } from "../rent-receivables/rent-receivables.service";
import {
  CreateRentPaymentDto,
  PreviewRentPaymentAllocationDto,
  RentPaymentAllocationPreview,
  RentPaymentMutationResult,
  UpdateRentPaymentDto,
} from "./rent-payments.dto";
import { RentPayment } from "./rent-payment.entity";

@Injectable()
export class RentPaymentsService {
  constructor(
    @InjectRepository(RentPayment)
    private readonly rentPaymentsRepository: Repository<RentPayment>,
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(RentReceivableSchedule)
    private readonly schedulesRepository: Repository<RentReceivableSchedule>,
    private readonly filesService: FilesService,
    private readonly dataSource: DataSource,
    private readonly rentReceivablesService: RentReceivablesService,
  ) {}

  list() {
    return this.rentPaymentsRepository.find({
      order: {
        paymentDate: "DESC",
        createdAt: "DESC",
      },
    });
  }

  async findOneOrFail(id: string) {
    const payment = await this.rentPaymentsRepository.findOne({
      where: { id },
    });
    if (!payment) {
      throw new NotFoundException("房租收费记录不存在");
    }
    return payment;
  }

  create(dto: CreateRentPaymentDto): Promise<RentPaymentMutationResult> {
    return this.save(dto);
  }

  update(
    id: string,
    dto: UpdateRentPaymentDto,
  ): Promise<RentPaymentMutationResult> {
    return this.save(dto, id);
  }

  async remove(id: string): Promise<RentPaymentMutationResult> {
    return this.dataSource.transaction(async (manager) => {
      const paymentsRepository = manager.getRepository(RentPayment);
      const lockedPayment = await this.findPaymentOrFail(
        paymentsRepository,
        id,
        true,
      );
      await this.lockContracts(manager, [lockedPayment.contractId]);
      const payment = await paymentsRepository.findOneOrFail({
        where: { id },
      });
      await this.ensureNoActiveReceipt(manager, id);
      await paymentsRepository.softDelete(id);
      await this.rentReceivablesService.rebuildPaymentAllocations(
        manager,
        payment.contractId,
      );

      return {
        payment,
        allocations: [],
        unallocatedAmount: 0,
      };
    });
  }

  async previewAllocation(
    dto: PreviewRentPaymentAllocationDto,
  ): Promise<RentPaymentAllocationPreview> {
    const targetContract = await this.contractsRepository.findOne({
      where: { id: dto.contractId, deletedAt: IsNull() },
    });
    if (!targetContract) {
      throw new BadRequestException("目标合同不存在或已删除");
    }

    let previewPaymentId = "~preview";
    if (dto.excludePaymentId) {
      const excludedPayment = await this.rentPaymentsRepository.findOne({
        where: {
          id: dto.excludePaymentId,
          contract: { deletedAt: IsNull() },
        },
      });
      if (!excludedPayment) {
        throw new BadRequestException("原房租收费记录不存在或已删除");
      }
      previewPaymentId = excludedPayment.id;
    }

    const schedules = await this.schedulesRepository.find({
      where: { contractId: dto.contractId },
      order: { dueDate: "ASC", sequence: "ASC" },
    });
    const payments = await this.rentPaymentsRepository.find({
      where: { contractId: dto.contractId },
      order: { paymentDate: "ASC", id: "ASC" },
    });
    const result = allocateRentPayments(
      schedules,
      payments
        .filter((payment) => payment.id !== dto.excludePaymentId)
        .concat({
          id: previewPaymentId,
          paymentDate: dto.paymentDate,
          amount: dto.amount,
        } as RentPayment),
    );

    return this.serializePaymentAllocation(result, schedules, previewPaymentId);
  }

  private async save(
    dto: CreateRentPaymentDto | UpdateRentPaymentDto,
    id?: string,
  ): Promise<RentPaymentMutationResult> {
    const attachmentFiles = await this.filesService.resolvePaymentVoucherFiles(
      dto.attachmentFileIds ?? [],
    );

    return this.dataSource.transaction(async (manager) => {
      const paymentsRepository = manager.getRepository(RentPayment);
      let payment: RentPayment;
      let previousContractId: string | undefined;
      if (id) {
        payment = await this.findPaymentOrFail(paymentsRepository, id, true);
        previousContractId = payment.contractId;
      } else {
        payment = paymentsRepository.create();
      }
      const affectedContractIds = this.sortedContractIds([
        previousContractId,
        dto.contractId,
      ]);
      const lockedContracts = await this.lockContracts(
        manager,
        affectedContractIds,
      );
      const contract = lockedContracts.get(dto.contractId)!;
      if (id) {
        await this.ensureNoActiveReceipt(manager, id);
      }

      payment.contractId = contract.id;
      payment.contract = contract;
      payment.unitId = contract.unitId;
      payment.tenantNameSnapshot = contract.tenantName;
      payment.paymentDate = dto.paymentDate;
      payment.amount = dto.amount;
      payment.method = dto.method.trim();
      payment.note = dto.note?.trim() ?? null;
      payment.attachmentFiles = attachmentFiles;

      const saved = await paymentsRepository.save(payment);
      let allocationResult!: RentAllocationResult;
      for (const contractId of affectedContractIds) {
        const rebuilt =
          await this.rentReceivablesService.rebuildPaymentAllocations(
            manager,
            contractId,
          );
        if (contractId === contract.id) {
          allocationResult = rebuilt;
        }
      }
      const reloadedPayment = await paymentsRepository.findOneOrFail({
        where: { id: saved.id },
      });
      const schedules = await manager
        .getRepository(RentReceivableSchedule)
        .find({
          where: { contractId: contract.id },
          order: { dueDate: "ASC", sequence: "ASC" },
        });

      return {
        payment: reloadedPayment,
        ...this.serializePaymentAllocation(
          allocationResult,
          schedules,
          saved.id,
        ),
      };
    });
  }

  private async findPaymentOrFail(
    repository: Repository<RentPayment>,
    id: string,
    lock = false,
  ): Promise<RentPayment> {
    const payment = await repository.findOne({
      where: { id },
      ...(lock
        ? {
            lock: { mode: "pessimistic_write" as const },
            loadEagerRelations: false,
          }
        : {}),
    });
    if (!payment) {
      throw new NotFoundException("房租收费记录不存在");
    }
    return payment;
  }

  private sortedContractIds(contractIds: Array<string | undefined>): string[] {
    return [
      ...new Set(contractIds.filter((id): id is string => Boolean(id))),
    ].sort();
  }

  private async lockContracts(
    manager: EntityManager,
    contractIds: string[],
  ): Promise<Map<string, Contract>> {
    const repository = manager.getRepository(Contract);
    const contracts = new Map<string, Contract>();
    for (const contractId of this.sortedContractIds(contractIds)) {
      const contract = await repository.findOne({
        where: { id: contractId, deletedAt: IsNull() },
        lock: { mode: "pessimistic_write" },
      });
      if (!contract) {
        throw new BadRequestException("合同不存在或已删除");
      }
      contracts.set(contractId, contract);
    }
    return contracts;
  }

  private async ensureNoActiveReceipt(
    manager: EntityManager,
    sourceId: string,
  ): Promise<void> {
    const receipt = await manager.getRepository(Receipt).findOne({
      where: {
        sourceType: ReceiptSourceType.RENT_PAYMENT,
        sourceId,
        status: ReceiptStatus.ACTIVE,
      },
    });

    if (receipt) {
      throw new BadRequestException("该房租记录已经开具收据，不能再修改或删除");
    }
  }

  private serializePaymentAllocation(
    result: RentAllocationResult,
    schedules: RentReceivableSchedule[],
    paymentId: string,
  ): RentPaymentAllocationPreview {
    const schedulesById = new Map(
      schedules.map((schedule) => [schedule.id, schedule]),
    );
    const allocations = result.allocations
      .filter((allocation) => allocation.rentPaymentId === paymentId)
      .map((allocation) => {
        const schedule = schedulesById.get(allocation.rentReceivableScheduleId);
        if (!schedule) {
          throw new Error(
            "Rent payment allocation references an unknown schedule",
          );
        }
        return {
          scheduleId: schedule.id,
          sequence: schedule.sequence,
          periodStart: schedule.periodStart,
          periodEnd: schedule.periodEnd,
          allocatedAmount: allocation.allocatedAmount,
        };
      });
    const unallocatedAmount =
      result.unallocatedPayments.find(
        (payment) => payment.rentPaymentId === paymentId,
      )?.amount ?? 0;

    return { allocations, unallocatedAmount };
  }
}
