import { BillingFrequency } from "../contracts/contract.enums";
import { buildRentSchedule } from "./rent-schedule";

describe("buildRentSchedule", () => {
  it("builds three annual periods anchored to the contract start date", () => {
    expect(
      buildRentSchedule({
        startDate: "2024-10-08",
        endDate: "2027-10-07",
        annualRent: 90000,
        billingFrequency: BillingFrequency.ANNUAL,
      }),
    ).toEqual([
      { sequence: 1, periodStart: "2024-10-08", periodEnd: "2025-10-07", dueDate: "2024-10-08", receivableAmount: 90000 },
      { sequence: 2, periodStart: "2025-10-08", periodEnd: "2026-10-07", dueDate: "2025-10-08", receivableAmount: 90000 },
      { sequence: 3, periodStart: "2026-10-08", periodEnd: "2027-10-07", dueDate: "2026-10-08", receivableAmount: 90000 },
    ]);
  });

  it("builds two annual periods for a two-year contract", () => {
    expect(
      buildRentSchedule({
        startDate: "2025-05-15",
        endDate: "2027-05-14",
        annualRent: 120000,
        billingFrequency: BillingFrequency.ANNUAL,
      }),
    ).toHaveLength(2);
  });

  it("splits odd annual cents between two semiannual periods", () => {
    expect(
      buildRentSchedule({
        startDate: "2026-01-31",
        endDate: "2026-12-31",
        annualRent: 100000.01,
        billingFrequency: BillingFrequency.SEMIANNUAL,
      }),
    ).toEqual([
      { sequence: 1, periodStart: "2026-01-31", periodEnd: "2026-07-30", dueDate: "2026-01-31", receivableAmount: 50000.01 },
      { sequence: 2, periodStart: "2026-07-31", periodEnd: "2026-12-31", dueDate: "2026-07-31", receivableAmount: 50000 },
    ]);
  });

  it("builds six semiannual periods for a three-year contract", () => {
    const periods = buildRentSchedule({
      startDate: "2024-01-01",
      endDate: "2026-12-31",
      annualRent: 120000,
      billingFrequency: BillingFrequency.SEMIANNUAL,
    });

    expect(periods).toHaveLength(6);
    expect(periods.map((item) => item.receivableAmount)).toEqual([60000, 60000, 60000, 60000, 60000, 60000]);
    expect(periods.at(-1)).toMatchObject({ periodStart: "2026-07-01", periodEnd: "2026-12-31" });
  });

  it("uses month end for a leap-day start without drifting future periods", () => {
    expect(
      buildRentSchedule({
        startDate: "2024-02-29",
        endDate: "2026-02-28",
        annualRent: 120000,
        billingFrequency: BillingFrequency.ANNUAL,
      }),
    ).toEqual([
      { sequence: 1, periodStart: "2024-02-29", periodEnd: "2025-02-27", dueDate: "2024-02-29", receivableAmount: 120000 },
      { sequence: 2, periodStart: "2025-02-28", periodEnd: "2026-02-27", dueDate: "2025-02-28", receivableAmount: 120000 },
      { sequence: 3, periodStart: "2026-02-28", periodEnd: "2026-02-28", dueDate: "2026-02-28", receivableAmount: 120000 },
    ]);
  });

  it("charges a complete final period without daily proration", () => {
    expect(
      buildRentSchedule({
        startDate: "2025-02-28",
        endDate: "2026-03-31",
        annualRent: 120000,
        billingFrequency: BillingFrequency.ANNUAL,
      }).map((item) => item.receivableAmount),
    ).toEqual([120000, 120000]);
  });

  it("supports a future contract without depending on the current date", () => {
    expect(
      buildRentSchedule({
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        annualRent: 120000,
        billingFrequency: BillingFrequency.ANNUAL,
      }),
    ).toHaveLength(1);
  });

  it.each([
    ["2026-01-02", "2026-01-01", 120000, "合同结束日期不能早于开始日期"],
    ["2026-01-01", "2026-12-31", 0, "年租金必须大于 0"],
    ["2026-01-01", "2026-12-31", -1, "年租金必须大于 0"],
  ])("rejects invalid contract input", (startDate, endDate, annualRent, message) => {
    expect(() =>
      buildRentSchedule({
        startDate,
        endDate,
        annualRent,
        billingFrequency: BillingFrequency.ANNUAL,
      }),
    ).toThrow(message);
  });
});
