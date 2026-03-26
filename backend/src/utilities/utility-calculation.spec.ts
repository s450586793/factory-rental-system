import { calculateUtilityCharge, round2 } from "./utility-calculation";

describe("calculateUtilityCharge", () => {
  it("calculates usage, adjusted usage and amount with line loss", () => {
    expect(
      calculateUtilityCharge({
        previousReading: 100,
        currentReading: 130,
        multiplier: 2,
        unitPrice: 1.25,
        lineLossPercent: 8,
      }),
    ).toEqual({
      usage: 60,
      adjustedUsage: 64.8,
      amount: 81,
    });
  });

  it("rounds to two decimals consistently", () => {
    expect(round2(10.234)).toBe(10.23);
  });
});
