import { join } from "path";
import {
  RentReconciliationPeriodStatus,
  RentReconciliationStatus,
  type TenantReconciliationDetail,
} from "./rent-reconciliation.types";
import { renderRentReconciliationPdf } from "./rent-reconciliation.document";

const fontPath = join(
  __dirname,
  "..",
  "..",
  "assets",
  "fonts",
  "NotoSansCJKsc-Regular.otf",
);

function detailFixture(paymentCount = 1): TenantReconciliationDetail {
  return {
    tenantName: "大理石",
    contractCount: 1,
    dueReceivableAmount: 100000,
    duePaidAmount: paymentCount ? 50000 : 0,
    outstandingAmount: paymentCount ? 50000 : 100000,
    prepaidAmount: 0,
    unallocatedAmount: 0,
    lastPaymentDate: paymentCount ? "2026-01-15" : null,
    status: RentReconciliationStatus.OUTSTANDING,
    periods: [
      {
        scheduleId: "schedule-1",
        contractId: "contract-1",
        sequence: 1,
        unit: {
          id: "unit-1",
          code: "5",
          location: "北门仓库",
        },
        startDate: "2025-09-01",
        endDate: "2026-08-31",
        dueDate: "2025-09-01",
        receivableAmount: 100000,
        paidAmount: paymentCount ? 50000 : 0,
        outstandingAmount: paymentCount ? 50000 : 100000,
        prepaidAmount: 0,
        status: RentReconciliationPeriodStatus.OVERDUE,
        payments: Array.from({ length: paymentCount }, (_, index) => ({
          id: `payment-${index}`,
          contractId: "contract-1",
          paymentDate: "2026-01-15",
          amount: Number((50000 / Math.max(paymentCount, 1)).toFixed(2)),
          method: "银行转账",
          note: `第 ${index + 1} 笔房租付款`,
          attachmentFiles: [],
          activeReceipt:
            index === 0
              ? {
                  id: "receipt-1",
                  receiptNo: "RC20260115-001",
                  pdfFile: null,
                }
              : null,
        })),
      },
    ],
  };
}

function pageCount(buffer: Buffer) {
  return buffer.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
}

describe("renderRentReconciliationPdf", () => {
  it("renders one complete page without appending a blank page", async () => {
    const buffer = await renderRentReconciliationPdf(
      detailFixture(),
      fontPath,
      "2026-08-21",
    );

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1000);
    expect(pageCount(buffer)).toBe(1);
  });

  it("renders an empty-payment period without failing or adding a page", async () => {
    const buffer = await renderRentReconciliationPdf(
      detailFixture(0),
      fontPath,
      "2026-08-21",
    );

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(buffer)).toBe(1);
  });

  it("adds only the pages needed when payment details overflow", async () => {
    const buffer = await renderRentReconciliationPdf(
      detailFixture(60),
      fontPath,
      "2026-08-21",
    );

    expect(pageCount(buffer)).toBeGreaterThan(1);
    expect(pageCount(buffer)).toBeLessThan(10);
  });
});
