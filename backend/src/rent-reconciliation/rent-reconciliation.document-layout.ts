import type {
  ContractPeriodReconciliation,
  TenantReconciliationDetail,
} from "./rent-reconciliation.types";
import { RentReconciliationPeriodStatus } from "./rent-reconciliation.types";

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

export const PAYMENT_CELL_HORIZONTAL_INSET = 5;
export const PAYMENT_CELL_VERTICAL_INSET = 7;
export const PAYMENT_ROW_MIN_HEIGHT = 28;

export function measurePaymentRowHeight(
  values: string[],
  widths: number[],
  measureHeight: (text: string, width: number) => number,
) {
  return Math.max(
    PAYMENT_ROW_MIN_HEIGHT,
    ...values.map(
      (value, index) =>
        measureHeight(
          value,
          widths[index] - PAYMENT_CELL_HORIZONTAL_INSET * 2,
        ) +
        PAYMENT_CELL_VERTICAL_INSET * 2,
    ),
  );
}

function formatMoney(value: number) {
  return `￥${Number(value).toFixed(2)}`;
}

function futureStatusLabel(status: RentReconciliationPeriodStatus) {
  if (status === RentReconciliationPeriodStatus.PARTIALLY_PREPAID) {
    return "部分预收";
  }
  if (status === RentReconciliationPeriodStatus.PREPAID) {
    return "已预收";
  }
  return "未到期";
}

export function buildSummaryItems(
  detail: Pick<
    TenantReconciliationDetail,
    "outstandingAmount" | "prepaidAmount" | "unallocatedAmount"
  >,
): PdfSummaryItem[] {
  return [
    {
      label: "当前结欠",
      amount: detail.outstandingAmount,
      tone: detail.outstandingAmount !== 0 ? "danger" : "default",
    },
    { label: "预收", amount: detail.prepaidAmount, tone: "default" },
    { label: "未分配结余", amount: detail.unallocatedAmount, tone: "default" },
  ];
}

export function buildPeriodAmountSegments(
  period: Pick<
    ContractPeriodReconciliation,
    | "receivableAmount"
    | "paidAmount"
    | "outstandingAmount"
    | "prepaidAmount"
    | "status"
  >,
): PdfTextSegment[] {
  const amounts = {
    text: `应收 ${formatMoney(period.receivableAmount)}  实收 ${formatMoney(period.paidAmount)}  `,
    tone: "default" as const,
  };
  if (
    period.status === RentReconciliationPeriodStatus.NOT_DUE ||
    period.status === RentReconciliationPeriodStatus.PARTIALLY_PREPAID ||
    period.status === RentReconciliationPeriodStatus.PREPAID
  ) {
    return [
      amounts,
      {
        text: `预收 ${formatMoney(period.prepaidAmount)}  ${futureStatusLabel(period.status)}`,
        tone: "default",
      },
    ];
  }

  return [
    amounts,
    {
      text: `结欠 ${formatMoney(period.outstandingAmount)}`,
      tone: period.outstandingAmount !== 0 ? "danger" : "default",
    },
    {
      text:
        period.status === RentReconciliationPeriodStatus.OVERDUE
          ? "  欠款"
          : "  已结清",
      tone: "default",
    },
  ];
}
