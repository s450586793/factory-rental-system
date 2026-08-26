import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { access } from "fs/promises";
import { join } from "path";
import { In, Repository } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import type { StorageConfig } from "../config/storage.config";
import { Contract } from "../contracts/contract.entity";
import { buildAccruedRentPeriods } from "../contracts/contract-rent-schedule";
import { StoredFile } from "../files/stored-file.entity";
import { Receipt, ReceiptSourceType, ReceiptStatus } from "../receipts/receipt.entity";
import {
  ListRentReconciliationQueryDto,
  TenantRentReconciliationQueryDto,
} from "./rent-reconciliation.dto";
import { renderRentReconciliationPdf } from "./rent-reconciliation.document";
import {
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

function toCents(value: number) {
  return Math.round(Number(value) * 100);
}

function fromCents(value: number) {
  return Number((value / 100).toFixed(2));
}

function resolveBalance(receivableCents: number, paidCents: number) {
  return {
    outstandingCents: Math.max(receivableCents - paidCents, 0),
    creditCents: Math.max(paidCents - receivableCents, 0),
  };
}

function resolveStatus(receivableCents: number, paidCents: number) {
  if (paidCents < receivableCents) {
    return RentReconciliationStatus.OUTSTANDING;
  }
  if (paidCents > receivableCents) {
    return RentReconciliationStatus.CREDIT;
  }
  return RentReconciliationStatus.SETTLED;
}

@Injectable()
export class RentReconciliationService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(Receipt)
    private readonly receiptsRepository: Repository<Receipt>,
    private readonly configService: ConfigService,
  ) {}

  async list(query: ListRentReconciliationQueryDto): Promise<RentReconciliationListResponse> {
    const { ledgers, availableYears } = await this.loadLedgers(query.year);
    const keyword = query.keyword?.trim().toLowerCase() ?? "";
    const items = ledgers
      .filter((ledger) => !keyword || ledger.tenantName.toLowerCase().includes(keyword))
      .filter((ledger) => !query.status || ledger.status === query.status)
      .map((ledger) => ({
        tenantName: ledger.tenantName,
        contractCount: ledger.contractCount,
        receivableAmount: ledger.receivableAmount,
        paidAmount: ledger.paidAmount,
        outstandingAmount: ledger.outstandingAmount,
        creditAmount: ledger.creditAmount,
        lastPaymentDate: ledger.lastPaymentDate,
        status: ledger.status,
      }))
      .sort(
        (left, right) =>
          right.outstandingAmount - left.outstandingAmount || left.tenantName.localeCompare(right.tenantName, "zh-CN"),
      );

    return { items, availableYears };
  }

  async detail(query: TenantRentReconciliationQueryDto): Promise<TenantReconciliationDetail> {
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
    const buffer = await renderRentReconciliationPdf(detail, fontPath, generatedDate);

    return {
      buffer,
      filename: `房租对账单_${this.sanitizeFilenameSegment(detail.tenantName)}_${generatedDate}.pdf`,
      mimeType: "application/pdf",
    };
  }

  private async loadLedgers(year?: number) {
    const contracts = await this.contractsRepository.find({
      relations: {
        unit: true,
        rentPayments: {
          attachmentFiles: true,
        },
      },
      order: {
        startDate: "DESC",
      },
    });
    const availableYears = this.resolveAvailableYears(contracts);
    const activePayments = contracts.flatMap((contract) =>
      (contract.rentPayments ?? []).filter((payment) => !payment.deletedAt),
    );
    const receiptMap = await this.loadActiveReceiptMap(activePayments.map((payment) => payment.id));
    const contractsByTenant = new Map<string, Contract[]>();

    contracts.forEach((contract) => {
      const tenantName = normalizeTenantName(contract.tenantName);
      const tenantContracts = contractsByTenant.get(tenantName) ?? [];
      tenantContracts.push(contract);
      contractsByTenant.set(tenantName, tenantContracts);
    });

    const ledgers = [...contractsByTenant.entries()]
      .map(([tenantName, tenantContracts]) =>
        this.buildTenantLedger(tenantName, tenantContracts, receiptMap, year),
      )
      .filter((ledger) => ledger.periods.length > 0);

    return { ledgers, availableYears };
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

    receipts
      .filter(
        (receipt) =>
          receipt.sourceType === ReceiptSourceType.RENT_PAYMENT && receipt.status === ReceiptStatus.ACTIVE,
      )
      .forEach((receipt) => receiptMap.set(receipt.sourceId, receipt));
    return receiptMap;
  }

  private buildTenantLedger(
    tenantName: string,
    contracts: Contract[],
    receiptMap: Map<string, Receipt>,
    year?: number,
  ) {
    const periods = contracts
      .flatMap((contract) => this.buildContractPeriods(contract, receiptMap))
      .filter((period) => !year || Number(period.startDate.slice(0, 4)) === year)
      .sort((left, right) => right.startDate.localeCompare(left.startDate));
    const receivableCents = periods.reduce((sum, period) => sum + toCents(period.receivableAmount), 0);
    const paidCents = periods.reduce((sum, period) => sum + toCents(period.paidAmount), 0);
    const { outstandingCents, creditCents } = resolveBalance(receivableCents, paidCents);
    const paymentDates = periods.flatMap((period) => period.payments.map((payment) => payment.paymentDate));

    return {
      tenantName,
      contractCount: periods.length,
      receivableAmount: fromCents(receivableCents),
      paidAmount: fromCents(paidCents),
      outstandingAmount: fromCents(outstandingCents),
      creditAmount: fromCents(creditCents),
      lastPaymentDate: paymentDates.sort((left, right) => right.localeCompare(left))[0] ?? null,
      status: resolveStatus(receivableCents, paidCents),
      periods,
    } satisfies TenantReconciliationDetail;
  }

  private buildContractPeriods(
    contract: Contract,
    receiptMap: Map<string, Receipt>,
  ): ContractPeriodReconciliation[] {
    const payments = (contract.rentPayments ?? [])
      .filter((payment) => !payment.deletedAt)
      .map((payment) => ({
        id: payment.id,
        contractId: contract.id,
        paymentDate: payment.paymentDate,
        amount: fromCents(toCents(payment.amount)),
        method: payment.method,
        note: payment.note,
        attachmentFiles: (payment.attachmentFiles ?? []).map((file) => this.serializeFile(file)),
        activeReceipt: this.serializeReceipt(receiptMap.get(payment.id) ?? null),
      }))
      .sort(
        (left, right) =>
          left.paymentDate.localeCompare(right.paymentDate) || left.id.localeCompare(right.id),
      ) satisfies RentReconciliationPayment[];
    const allocatedPeriods = buildAccruedRentPeriods(contract, formatShanghaiDate()).map((period) => ({
      ...period,
      receivableCents: toCents(period.receivableAmount),
      paidCents: 0,
      payments: [] as RentReconciliationPayment[],
    }));

    payments.forEach((payment) => {
      let remainingCents = toCents(payment.amount);
      allocatedPeriods.forEach((period) => {
        if (remainingCents <= 0) {
          return;
        }
        const allocationCents = Math.min(
          remainingCents,
          Math.max(period.receivableCents - period.paidCents, 0),
        );
        if (allocationCents <= 0) {
          return;
        }
        this.addPaymentAllocation(period.payments, payment, allocationCents);
        period.paidCents += allocationCents;
        remainingCents -= allocationCents;
      });

      const latestPeriod = allocatedPeriods.at(-1);
      if (latestPeriod && remainingCents > 0) {
        this.addPaymentAllocation(latestPeriod.payments, payment, remainingCents);
        latestPeriod.paidCents += remainingCents;
      }
    });

    return allocatedPeriods.map((period) => {
      const { outstandingCents, creditCents } = resolveBalance(period.receivableCents, period.paidCents);
      return {
        contractId: contract.id,
        unit: {
          id: contract.unit.id,
          code: contract.unit.code,
          location: contract.unit.location,
        },
        startDate: period.startDate,
        endDate: period.endDate,
        receivableAmount: fromCents(period.receivableCents),
        paidAmount: fromCents(period.paidCents),
        outstandingAmount: fromCents(outstandingCents),
        creditAmount: fromCents(creditCents),
        status: resolveStatus(period.receivableCents, period.paidCents),
        payments: period.payments.sort(
          (left, right) =>
            right.paymentDate.localeCompare(left.paymentDate) || right.id.localeCompare(left.id),
        ),
      };
    });
  }

  private addPaymentAllocation(
    allocations: RentReconciliationPayment[],
    payment: RentReconciliationPayment,
    allocationCents: number,
  ) {
    const existing = allocations.find((allocation) => allocation.id === payment.id);
    if (existing) {
      existing.amount = fromCents(toCents(existing.amount) + allocationCents);
      return;
    }
    allocations.push({ ...payment, amount: fromCents(allocationCents) });
  }

  private serializeReceipt(receipt: Receipt | null): ReconciliationReceipt | null {
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

  private resolveAvailableYears(contracts: Contract[]) {
    const years = new Set<number>();
    contracts.forEach((contract) => {
      buildAccruedRentPeriods(contract, formatShanghaiDate()).forEach((period) => {
        const year = Number(period.startDate.slice(0, 4));
        if (Number.isInteger(year)) {
          years.add(year);
        }
      });
    });
    return [...years].sort((left, right) => right - left);
  }

  private async resolvePdfFontPath() {
    const storage = this.configService.getOrThrow<StorageConfig>("storage");
    const candidates = [
      "/app/assets/fonts/NotoSansCJKsc-Regular.otf",
      storage.pdfFontPath && !storage.pdfFontPath.toLowerCase().endsWith(".ttc") ? storage.pdfFontPath : null,
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
    return [...value]
      .map((character) =>
        character.charCodeAt(0) < 32 || "\\/:*?\"<>|".includes(character) ? "_" : character,
      )
      .join("")
      .replace(/_+/g, "_")
      .trim() || UNKNOWN_TENANT_NAME;
  }
}
