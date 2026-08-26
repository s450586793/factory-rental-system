import { buildAccruedRentPeriods, calculateAccruedReceivable } from "./contract-rent-schedule";

describe("contract rent schedule", () => {
  it("splits a two-year contract by lease anniversaries", () => {
    expect(
      buildAccruedRentPeriods(
        {
          startDate: "2024-10-08",
          endDate: "2026-10-07",
          annualRent: 90000,
        },
        "2026-08-26",
      ),
    ).toEqual([
      { startDate: "2024-10-08", endDate: "2025-10-07", receivableAmount: 90000 },
      { startDate: "2025-10-08", endDate: "2026-10-07", receivableAmount: 90000 },
    ]);
  });

  it("does not accrue a lease year before its anniversary begins", () => {
    const contract = {
      startDate: "2024-10-08",
      endDate: "2027-10-07",
      annualRent: 200000,
    };

    expect(buildAccruedRentPeriods(contract, "2026-08-26")).toHaveLength(2);
    expect(calculateAccruedReceivable(contract, "2026-08-26")).toBe(400000);
  });

  it("does not accrue rent for a future contract", () => {
    const contract = {
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      annualRent: 120000,
    };

    expect(buildAccruedRentPeriods(contract, "2026-08-26")).toEqual([]);
    expect(calculateAccruedReceivable(contract, "2026-08-26")).toBe(0);
  });

  it("keeps the annual rent for a final partial lease year instead of prorating by days", () => {
    expect(
      buildAccruedRentPeriods(
        {
          startDate: "2025-01-01",
          endDate: "2026-03-31",
          annualRent: 120000,
        },
        "2026-02-01",
      ),
    ).toEqual([
      { startDate: "2025-01-01", endDate: "2025-12-31", receivableAmount: 120000 },
      { startDate: "2026-01-01", endDate: "2026-03-31", receivableAmount: 120000 },
    ]);
  });
});
