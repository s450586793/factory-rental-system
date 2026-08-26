import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
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
      const payment = await this.findPaymentOrFail(paymentsRepository, id);
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
    const schedules = await this.schedulesRepository.find({
      where: { contractId: dto.contractId },
      order: { dueDate: "ASC", sequence: "ASC" },
    });
    const payments = await this.rentPaymentsRepository.find({
      where: { contractId: dto.contractId },
      order: { paymentDate: "ASC", id: "ASC" },
    });
    const previewPaymentId = "~preview";
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
      const contractsRepository = manager.getRepository(Contract);
      const contract = await contractsRepository.findOne({
        where: { id: dto.contractId },
      });
      if (!contract) {
        throw new BadRequestException("合同不存在");
      }

      const paymentsRepository = manager.getRepository(RentPayment);
      let payment: RentPayment;
      let previousContractId: string | undefined;
      if (id) {
        payment = await this.findPaymentOrFail(paymentsRepository, id);
        previousContractId = payment.contractId;
        await this.ensureNoActiveReceipt(manager, id);
      } else {
        payment = paymentsRepository.create();
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
      if (previousContractId && previousContractId !== contract.id) {
        await this.rentReceivablesService.rebuildPaymentAllocations(
          manager,
          previousContractId,
        );
      }
      const allocationResult =
        await this.rentReceivablesService.rebuildPaymentAllocations(
          manager,
          contract.id,
        );
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
  ): Promise<RentPayment> {
    const payment = await repository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException("房租收费记录不存在");
    }
    return payment;
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
