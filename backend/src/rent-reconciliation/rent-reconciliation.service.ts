import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Contract } from "../contracts/contract.entity";
import { StoredFile } from "../files/stored-file.entity";
import { Receipt, ReceiptSourceType, ReceiptStatus } from "../receipts/receipt.entity";
import {
  ListRentReconciliationQueryDto,
  RentReconciliationStatus,
  TenantRentReconciliationQueryDto,
} from "./rent-reconciliation.dto";
import type {
  ContractPeriodReconciliation,
  ReconciliationFile,
  ReconciliationReceipt,
  RentReconciliationListResponse,
  RentReconciliationPayment,
  TenantReconciliationDetail,
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

function contractOverlapsYear(contract: Contract, year: number) {
  return contract.startDate <= `${year}-12-31` && contract.endDate >= `${year}-01-01`;
}

@Injectable()
export class RentReconciliationService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(Receipt)
    private readonly receiptsRepository: Repository<Receipt>,
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
    const selectedContracts = year ? contracts.filter((contract) => contractOverlapsYear(contract, year)) : contracts;
    const activePayments = selectedContracts.flatMap((contract) =>
      (contract.rentPayments ?? []).filter((payment) => !payment.deletedAt),
    );
    const receiptMap = await this.loadActiveReceiptMap(activePayments.map((payment) => payment.id));
    const contractsByTenant = new Map<string, Contract[]>();

    selectedContracts.forEach((contract) => {
      const tenantName = normalizeTenantName(contract.tenantName);
      const tenantContracts = contractsByTenant.get(tenantName) ?? [];
      tenantContracts.push(contract);
      contractsByTenant.set(tenantName, tenantContracts);
    });

    const ledgers = [...contractsByTenant.entries()].map(([tenantName, tenantContracts]) =>
      this.buildTenantLedger(tenantName, tenantContracts, receiptMap),
    );

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

  private buildTenantLedger(tenantName: string, contracts: Contract[], receiptMap: Map<string, Receipt>) {
    const periods = contracts
      .map((contract) => this.buildContractPeriod(contract, receiptMap))
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

  private buildContractPeriod(contract: Contract, receiptMap: Map<string, Receipt>): ContractPeriodReconciliation {
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
          right.paymentDate.localeCompare(left.paymentDate) || right.id.localeCompare(left.id),
      ) satisfies RentReconciliationPayment[];
    const receivableCents = toCents(contract.annualRent);
    const paidCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
    const { outstandingCents, creditCents } = resolveBalance(receivableCents, paidCents);

    return {
      contractId: contract.id,
      unit: {
        id: contract.unit.id,
        code: contract.unit.code,
        location: contract.unit.location,
      },
      startDate: contract.startDate,
      endDate: contract.endDate,
      receivableAmount: fromCents(receivableCents),
      paidAmount: fromCents(paidCents),
      outstandingAmount: fromCents(outstandingCents),
      creditAmount: fromCents(creditCents),
      status: resolveStatus(receivableCents, paidCents),
      payments,
    };
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
      const startYear = Number(contract.startDate.slice(0, 4));
      const endYear = Number(contract.endDate.slice(0, 4));
      if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
        return;
      }
      for (let year = startYear; year <= endYear; year += 1) {
        years.add(year);
      }
    });
    return [...years].sort((left, right) => right - left);
  }
}
