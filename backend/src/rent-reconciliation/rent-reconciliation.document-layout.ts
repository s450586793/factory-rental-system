import type { ContractPeriodReconciliation, TenantReconciliationDetail } from "./rent-reconciliation.types";
import { RentReconciliationStatus } from "./rent-reconciliation.types";

export type PdfTextTone = "default" | "danger";

export interface PdfSummaryItem {
  label: string;
  amount: number;
  tone: PdfTextTone;
}

export interface PdfTextSegment {
  text: string;
  tone: PdfTextTone;
}

function formatMoney(value: number) {
  return `￥${Number(value).toFixed(2)}`;
}

function statusLabel(status: RentReconciliationStatus) {
  if (status === RentReconciliationStatus.OUTSTANDING) {
    return "欠款";
  }
  if (status === RentReconciliationStatus.CREDIT) {
    return "有结余";
  }
  return "已结清";
}

export function buildSummaryItems(
  detail: Pick<TenantReconciliationDetail, "outstandingAmount" | "creditAmount">,
): PdfSummaryItem[] {
  return [
    {
      label: "当前结欠",
      amount: detail.outstandingAmount,
      tone: detail.outstandingAmount !== 0 ? "danger" : "default",
    },
    { label: "当前结余", amount: detail.creditAmount, tone: "default" },
  ];
}

export function buildPeriodAmountSegments(
  period: Pick<
    ContractPeriodReconciliation,
    "receivableAmount" | "paidAmount" | "outstandingAmount" | "creditAmount" | "status"
  >,
): PdfTextSegment[] {
  return [
    {
      text: `应收 ${formatMoney(period.receivableAmount)}  实收 ${formatMoney(period.paidAmount)}  `,
      tone: "default",
    },
    {
      text: `结欠 ${formatMoney(period.outstandingAmount)}`,
      tone: period.outstandingAmount !== 0 ? "danger" : "default",
    },
    {
      text: `  结余 ${formatMoney(period.creditAmount)}  ${statusLabel(period.status)}`,
      tone: "default",
    },
  ];
}
