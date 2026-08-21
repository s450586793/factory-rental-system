import { RentReconciliationStatus } from "./rent-reconciliation.types";
import { buildPeriodAmountSegments, buildSummaryItems } from "./rent-reconciliation.document-layout";

describe("rent reconciliation PDF layout", () => {
  it("keeps only current outstanding and credit in the summary", () => {
    expect(
      buildSummaryItems({
        outstandingAmount: 31000,
        creditAmount: 0,
      }),
    ).toEqual([
      { label: "当前结欠", amount: 31000, tone: "danger" },
      { label: "当前结余", amount: 0, tone: "default" },
    ]);
  });

  it("marks a non-zero period outstanding label and amount as dangerous", () => {
    const segments = buildPeriodAmountSegments({
      receivableAmount: 100000,
      paidAmount: 75000,
      outstandingAmount: 25000,
      creditAmount: 0,
      status: RentReconciliationStatus.OUTSTANDING,
    });

    expect(segments).toContainEqual({ text: "结欠 ￥25000.00", tone: "danger" });
  });

  it("keeps a zero outstanding amount in the default tone", () => {
    const summary = buildSummaryItems({ outstandingAmount: 0, creditAmount: 1000 });
    const segments = buildPeriodAmountSegments({
      receivableAmount: 100000,
      paidAmount: 101000,
      outstandingAmount: 0,
      creditAmount: 1000,
      status: RentReconciliationStatus.CREDIT,
    });

    expect(summary[0]).toEqual({ label: "当前结欠", amount: 0, tone: "default" });
    expect(segments).toContainEqual({ text: "结欠 ￥0.00", tone: "default" });
  });
});
