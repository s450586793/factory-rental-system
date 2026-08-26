import { buildRentSchedulePreview } from "./rent-schedule-preview";

describe("buildRentSchedulePreview", () => {
  it.each([
    ["2026-01-01", "2026-12-31", "annual", 1],
    ["2025-05-15", "2027-05-14", "annual", 2],
    ["2024-01-01", "2026-12-31", "annual", 3],
    ["2024-01-01", "2026-12-31", "semiannual", 6],
  ] as const)("previews %s through %s with %s billing", (startDate, endDate, frequency, count) => {
    expect(buildRentSchedulePreview(startDate, endDate, frequency)).toEqual({
      count,
      firstDueDate: startDate,
    });
  });

  it("keeps a month-end semiannual schedule anchored without adding a third period", () => {
    expect(buildRentSchedulePreview("2026-01-31", "2026-12-31", "semiannual")).toEqual({
      count: 2,
      firstDueDate: "2026-01-31",
    });
  });

  it("uses the backend leap-day anchor rule", () => {
    expect(buildRentSchedulePreview("2024-02-29", "2026-02-28", "annual")).toEqual({
      count: 3,
      firstDueDate: "2024-02-29",
    });
  });

  it.each([
    ["", "2026-12-31"],
    ["2026-01-01", ""],
    ["2026-02-30", "2026-12-31"],
    ["2026-02-01", "2026-01-31"],
  ])("returns an empty preview for incomplete or invalid dates", (startDate, endDate) => {
    expect(buildRentSchedulePreview(startDate, endDate, "annual")).toEqual({
      count: 0,
      firstDueDate: null,
    });
  });
});
