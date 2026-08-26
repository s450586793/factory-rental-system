import { fromCents, toCents } from "./cents";

describe("cents", () => {
  it("converts decimal amounts to integer cents", () => {
    expect(toCents(100000.01)).toBe(10000001);
    expect(toCents(1.006)).toBe(101);
  });

  it("converts integer cents to two-decimal amounts", () => {
    expect(fromCents(10000001)).toBe(100000.01);
    expect(fromCents(5000000)).toBe(50000);
  });
});
