import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { access } from "fs/promises";
import { join } from "path";
import { In, IsNull, Repository } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { fromCents, toCents } from "../common/money/cents";
import type { StorageConfig } from "../config/storage.config";
import { StoredFile } from "../files/stored-file.entity";
import {
  Receipt,
  ReceiptSourceType,
  ReceiptStatus,
} from "../receipts/receipt.entity";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { RentPaymentAllocation } from "../rent-receivables/rent-payment-allocation.entity";
import { RentReceivableSchedule } from "../rent-receivables/rent-receivable-schedule.entity";
import {
  ListRentReconciliationQueryDto,
  TenantRentReconciliationQueryDto,
} from "./rent-reconciliation.dto";
import { renderRentReconciliationPdf } from "./rent-reconciliation.document";
import {
  RentReconciliationPeriodStatus,
  RentReconciliationStatus,
  type ContractPeriodReconciliation,
  type ReconciliationFile,
  type ReconciliationReceipt,
  type RentReconciliationListResponse,
  type RentReconciliationPayment,
  type TenantReconciliationDetail,
} from "./rent-reconciliation.types";

const UNKNOWN_TENANT_NAME = "未填写租户";

function normalizeTenantName(value: string) {
  return value.trim() || UNKNOWN_TENANT_NAME;
}

function activeAllocation(allocation: RentPaymentAllocation) {
  return allocation.deletedAt == null && allocation.payment?.deletedAt == null;
}

function resolvePeriodStatus(
  dueDate: string,
  receivableCents: number,
  paidCents: number,
  asOfDate: string,
) {
  if (dueDate <= asOfDate) {
    return paidCents >= receivableCents
      ? RentReconciliationPeriodStatus.SETTLED
      : RentReconciliationPeriodStatus.OVERDUE;
  }
  if (paidCents === 0) {
    return RentReconciliationPeriodStatus.NOT_DUE;
  }
  return paidCents < receivableCents
    ? RentReconciliationPeriodStatus.PARTIALLY_PREPAID
    : RentReconciliationPeriodStatus.PREPAID;
}

function resolveLedgerStatus(
  outstandingCents: number,
  unallocatedCents: number,
  prepaidCents: number,
) {
  if (outstandingCents > 0) {
    return RentReconciliationStatus.OUTSTANDING;
  }
  if (unallocatedCents > 0) {
    return RentReconciliationStatus.CREDIT;
  }
  if (prepaidCents > 0) {
    return RentReconciliationStatus.PREPAID;
  }
  return RentReconciliationStatus.SETTLED;
}

@Injectable()
export class RentReconciliationService {
  constructor(
    @InjectRepository(RentReceivableSchedule)
    private readonly schedulesRepository: Repository<RentReceivableSchedule>,
    @InjectRepository(RentPayment)
    private readonly paymentsRepository: Repository<RentPayment>,
    @InjectRepository(Receipt)
    private readonly receiptsRepository: Repository<Receipt>,
    private readonly configService: ConfigService,
  ) {}

  async list(
    query: ListRentReconciliationQueryDto,
  ): Promise<RentReconciliationListResponse> {
    const { ledgers, availableYears } = await this.loadLedgers(query.year);
    const keyword = query.keyword?.trim().toLowerCase() ?? "";
    const items = ledgers
      .filter(
        (ledger) =>
          !keyword || ledger.tenantName.toLowerCase().includes(keyword),
      )
      .filter((ledger) => !query.status || ledger.status === query.status)
      .map((ledger) => ({
        tenantName: ledger.tenantName,
        contractCount: ledger.contractCount,
        dueReceivableAmount: ledger.dueReceivableAmount,
        duePaidAmount: ledger.duePaidAmount,
        outstandingAmount: ledger.outstandingAmount,
        prepaidAmount: ledger.prepaidAmount,
        unallocatedAmount: ledger.unallocatedAmount,
        lastPaymentDate: ledger.lastPaymentDate,
        status: ledger.status,
      }))
      .sort(
        (left, right) =>
          right.outstandingAmount - left.outstandingAmount ||
          left.tenantName.localeCompare(right.tenantName, "zh-CN"),
      );

    return { items, availableYears };
  }

  async detail(
    query: TenantRentReconciliationQueryDto,
  ): Promise<TenantReconciliationDetail> {
    const tenantName = normalizeTenantName(query.tenantName);
    const { ledgers } = await this.loadLedgers(query.year);
    const detail = ledgers.find((ledger) => ledger.tenantName === tenantName);

    if (!detail) {
      throw new NotFoundException("未找到符合条件的房租对账记录");
    }

    return detail;
  }

  async generatePdf(query: TenantRentReconciliationQueryDto) {
    const detail = await this.detail(query);
    const generatedDate = formatShanghaiDate();
    const fontPath = await this.resolvePdfFontPath();
    const buffer = await renderRentReconciliationPdf(
      detail,
      fontPath,
      generatedDate,
    );

    return {
      buffer,
      filename: `房租对账单_${this.sanitizeFilenameSegment(detail.tenantName)}_${generatedDate}.pdf`,
      mimeType: "application/pdf",
    };
  }

  private async loadLedgers(year?: number) {
    const [foundSchedules, foundPayments] = await Promise.all([
      this.schedulesRepository.find({
        where: { contract: { deletedAt: IsNull() } },
        relations: {
          contract: { unit: true },
          allocations: { payment: { attachmentFiles: true } },
        },
        order: { periodStart: "DESC", sequence: "DESC" },
      }),
      this.paymentsRepository.find({
        where: { contract: { deletedAt: IsNull() } },
        relations: { contract: true, attachmentFiles: true },
        order: { paymentDate: "DESC", id: "DESC" },
      }),
    ]);
    const schedules = foundSchedules.filter(
      (schedule) => schedule.contract?.deletedAt == null,
    );
    const payments = foundPayments.filter(
      (payment) =>
        payment.deletedAt == null && payment.contract?.deletedAt == null,
    );
    const receiptMap = await this.loadActiveReceiptMap(
      payments.map((payment) => payment.id),
    );
    const schedulesByTenant = new Map<string, RentReceivableSchedule[]>();
    const paymentsByTenant = new Map<string, RentPayment[]>();

    for (const schedule of schedules) {
      const tenantName = normalizeTenantName(schedule.contract.tenantName);
      schedulesByTenant.set(tenantName, [
        ...(schedulesByTenant.get(tenantName) ?? []),
        schedule,
      ]);
    }
    for (const payment of payments) {
      const tenantName = normalizeTenantName(payment.contract.tenantName);
      paymentsByTenant.set(tenantName, [
        ...(paymentsByTenant.get(tenantName) ?? []),
        payment,
      ]);
    }

    const ledgers = [...schedulesByTenant.entries()]
      .map(([tenantName, tenantSchedules]) =>
        this.buildTenantLedger(
          tenantName,
          tenantSchedules,
          paymentsByTenant.get(tenantName) ?? [],
          receiptMap,
          year,
        ),
      )
      .filter(
        (ledger): ledger is TenantReconciliationDetail => ledger !== null,
      );

    return { ledgers, availableYears: this.resolveAvailableYears(schedules) };
  }

  private async loadActiveReceiptMap(paymentIds: string[]) {
    const receiptMap = new Map<string, Receipt>();
    if (!paymentIds.length) {
      return receiptMap;
    }

    const receipts = await this.receiptsRepository.find({
      where: {
        sourceType: ReceiptSourceType.RENT_PAYMENT,
        sourceId: In(paymentIds),
        status: ReceiptStatus.ACTIVE,
      },
    });
    for (const receipt of receipts) {
      if (
        receipt.sourceType === ReceiptSourceType.RENT_PAYMENT &&
        receipt.status === ReceiptStatus.ACTIVE
      ) {
        receiptMap.set(receipt.sourceId, receipt);
      }
    }
    return receiptMap;
  }

  private buildTenantLedger(
    tenantName: string,
    schedules: RentReceivableSchedule[],
    payments: RentPayment[],
    receiptMap: Map<string, Receipt>,
    year?: number,
  ): TenantReconciliationDetail | null {
    const asOfDate = formatShanghaiDate();
    const selectedSchedules = schedules.filter(
      (schedule) =>
        year === undefined || Number(schedule.periodStart.slice(0, 4)) === year,
    );
    if (!selectedSchedules.length) {
      return null;
    }

    const periods = selectedSchedules
      .map((schedule) => this.serializePeriod(schedule, receiptMap, asOfDate))
      .sort(
        (left, right) =>
          right.startDate.localeCompare(left.startDate) ||
          right.sequence - left.sequence,
      );
    const duePeriods = periods.filter((period) => period.dueDate <= asOfDate);
    const dueReceivableCents = duePeriods.reduce(
      (sum, period) => sum + toCents(period.receivableAmount),
      0,
    );
    const duePaidCents = duePeriods.reduce(
      (sum, period) => sum + toCents(period.paidAmount),
      0,
    );
    const outstandingCents = Math.max(dueReceivableCents - duePaidCents, 0);
    const prepaidCents = periods
      .filter((period) => period.dueDate > asOfDate)
      .reduce((sum, period) => sum + toCents(period.paidAmount), 0);
    const totalPaymentCents = payments.reduce(
      (sum, payment) => sum + toCents(payment.amount),
      0,
    );
    const totalAllocatedCents = schedules.reduce(
      (sum, schedule) =>
        sum +
        (schedule.allocations ?? [])
          .filter(activeAllocation)
          .reduce(
            (allocationSum, allocation) =>
              allocationSum + toCents(allocation.allocatedAmount),
            0,
          ),
      0,
    );
    const unallocatedCents = Math.max(
      totalPaymentCents - totalAllocatedCents,
      0,
    );
    const paymentDates = periods.flatMap((period) =>
      period.payments.map((payment) => payment.paymentDate),
    );

    return {
      tenantName,
      contractCount: periods.length,
      dueReceivableAmount: fromCents(dueReceivableCents),
      duePaidAmount: fromCents(duePaidCents),
      outstandingAmount: fromCents(outstandingCents),
      prepaidAmount: fromCents(prepaidCents),
      unallocatedAmount: fromCents(unallocatedCents),
      lastPaymentDate:
        paymentDates.sort((left, right) => right.localeCompare(left))[0] ??
        null,
      status: resolveLedgerStatus(
        outstandingCents,
        unallocatedCents,
        prepaidCents,
      ),
      periods,
    };
  }

  private serializePeriod(
    schedule: RentReceivableSchedule,
    receiptMap: Map<string, Receipt>,
    asOfDate: string,
  ): ContractPeriodReconciliation {
    const paymentMap = new Map<string, RentReconciliationPayment>();
    let paidCents = 0;
    for (const allocation of (schedule.allocations ?? []).filter(
      activeAllocation,
    )) {
      const allocationCents = toCents(allocation.allocatedAmount);
      paidCents += allocationCents;
      const existing = paymentMap.get(allocation.payment.id);
      if (existing) {
        existing.amount = fromCents(toCents(existing.amount) + allocationCents);
        continue;
      }
      paymentMap.set(
        allocation.payment.id,
        this.serializePayment(allocation.payment, allocationCents, receiptMap),
      );
    }

    const receivableCents = toCents(schedule.receivableAmount);
    const isDue = schedule.dueDate <= asOfDate;
    const outstandingCents = isDue
      ? Math.max(receivableCents - paidCents, 0)
      : 0;
    const prepaidCents = isDue ? 0 : paidCents;

    return {
      scheduleId: schedule.id,
      contractId: schedule.contractId,
      sequence: schedule.sequence,
      unit: {
        id: schedule.contract.unit.id,
        code: schedule.contract.unit.code,
        location: schedule.contract.unit.location,
      },
      startDate: schedule.periodStart,
      endDate: schedule.periodEnd,
      dueDate: schedule.dueDate,
      receivableAmount: fromCents(receivableCents),
      paidAmount: fromCents(paidCents),
      outstandingAmount: fromCents(outstandingCents),
      prepaidAmount: fromCents(prepaidCents),
      status: resolvePeriodStatus(
        schedule.dueDate,
        receivableCents,
        paidCents,
        asOfDate,
      ),
      payments: [...paymentMap.values()].sort(
        (left, right) =>
          right.paymentDate.localeCompare(left.paymentDate) ||
          right.id.localeCompare(left.id),
      ),
    };
  }

  private serializePayment(
    payment: RentPayment,
    allocationCents: number,
    receiptMap: Map<string, Receipt>,
  ): RentReconciliationPayment {
    return {
      id: payment.id,
      contractId: payment.contractId,
      paymentDate: payment.paymentDate,
      amount: fromCents(allocationCents),
      method: payment.method,
      note: payment.note,
      attachmentFiles: (payment.attachmentFiles ?? []).map((file) =>
        this.serializeFile(file),
      ),
      activeReceipt: this.serializeReceipt(receiptMap.get(payment.id) ?? null),
    };
  }

  private serializeReceipt(
    receipt: Receipt | null,
  ): ReconciliationReceipt | null {
    if (!receipt) {
      return null;
    }
    return {
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      pdfFile: receipt.pdfFile ? this.serializeFile(receipt.pdfFile) : null,
    };
  }

  private serializeFile(file: StoredFile): ReconciliationFile {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: Number(file.size),
      category: file.category,
    };
  }

  private resolveAvailableYears(schedules: RentReceivableSchedule[]) {
    return [
      ...new Set(
        schedules
          .map((schedule) => Number(schedule.periodStart.slice(0, 4)))
          .filter(Number.isInteger),
      ),
    ].sort((left, right) => right - left);
  }

  private async resolvePdfFontPath() {
    const storage = this.configService.getOrThrow<StorageConfig>("storage");
    const candidates = [
      "/app/assets/fonts/NotoSansCJKsc-Regular.otf",
      storage.pdfFontPath && !storage.pdfFontPath.toLowerCase().endsWith(".ttc")
        ? storage.pdfFontPath
        : null,
      join(process.cwd(), "assets", "fonts", "NotoSansCJKsc-Regular.otf"),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    throw new ServiceUnavailableException("对账单 PDF 字体不可用");
  }

  private sanitizeFilenameSegment(value: string) {
    return (
      [...value]
        .map((character) =>
          character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character)
            ? "_"
            : character,
        )
        .join("")
        .replace(/_+/g, "_")
        .trim() || UNKNOWN_TENANT_NAME
    );
  }
}
