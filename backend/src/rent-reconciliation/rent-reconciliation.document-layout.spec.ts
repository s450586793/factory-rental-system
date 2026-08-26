import { RentReconciliationPeriodStatus } from "./rent-reconciliation.types";
import {
  buildPeriodAmountSegments,
  buildSummaryItems,
} from "./rent-reconciliation.document-layout";

describe("rent reconciliation PDF layout", () => {
  it("keeps only current outstanding, prepayment, and unallocated balance in the summary", () => {
    const items = buildSummaryItems({
      outstandingAmount: 31000,
      prepaidAmount: 12000,
      unallocatedAmount: 5000,
    });

    expect(items).toEqual([
      { label: "当前结欠", amount: 31000, tone: "danger" },
      { label: "预收", amount: 12000, tone: "default" },
      { label: "未分配结余", amount: 5000, tone: "default" },
    ]);
    expect(items.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["累计应收", "累计实收"]),
    );
  });

  it("marks a non-zero period outstanding label and amount as dangerous", () => {
    const segments = buildPeriodAmountSegments({
      receivableAmount: 100000,
      paidAmount: 75000,
      outstandingAmount: 25000,
      prepaidAmount: 0,
      status: RentReconciliationPeriodStatus.OVERDUE,
    });

    expect(segments).toContainEqual({
      text: "结欠 ￥25000.00",
      tone: "danger",
    });
  });

  it.each([
    [RentReconciliationPeriodStatus.NOT_DUE, 0, "未到期"],
    [RentReconciliationPeriodStatus.PARTIALLY_PREPAID, 25000, "部分预收"],
    [RentReconciliationPeriodStatus.PREPAID, 100000, "已预收"],
  ])(
    "renders future status %s without debt wording",
    (status, prepaidAmount, label) => {
      const segments = buildPeriodAmountSegments({
        receivableAmount: 100000,
        paidAmount: prepaidAmount,
        outstandingAmount: 0,
        prepaidAmount,
        status,
      });
      const text = segments.map((segment) => segment.text).join("");

      expect(text).toContain(label);
      expect(text).not.toContain("结欠");
      expect(text).not.toContain("欠款");
      expect(segments.every((segment) => segment.tone === "default")).toBe(
        true,
      );
    },
  );

  it("keeps zero current outstanding in the default tone", () => {
    const summary = buildSummaryItems({
      outstandingAmount: 0,
      prepaidAmount: 1000,
      unallocatedAmount: 0,
    });

    expect(summary[0]).toEqual({
      label: "当前结欠",
      amount: 0,
      tone: "default",
    });
  });
});
