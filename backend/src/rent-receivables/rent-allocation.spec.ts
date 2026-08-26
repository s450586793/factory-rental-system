import { allocateRentPayments } from "./rent-allocation";

describe("allocateRentPayments", () => {
  it("allocates a payment across the oldest schedules and keeps excess unallocated", () => {
    const result = allocateRentPayments(
      [
        { id: "s1", dueDate: "2025-09-01", sequence: 1, receivableAmount: 90000 },
        { id: "s2", dueDate: "2026-09-01", sequence: 2, receivableAmount: 90000 },
      ],
      [
        { id: "p1", paymentDate: "2025-09-01", amount: 100000 },
        { id: "p2", paymentDate: "2026-01-01", amount: 90000 },
      ],
    );

    expect(result.allocations).toEqual([
      { rentPaymentId: "p1", rentReceivableScheduleId: "s1", allocatedAmount: 90000 },
      { rentPaymentId: "p1", rentReceivableScheduleId: "s2", allocatedAmount: 10000 },
      { rentPaymentId: "p2", rentReceivableScheduleId: "s2", allocatedAmount: 80000 },
    ]);
    expect(result.unallocatedPayments).toEqual([{ rentPaymentId: "p2", amount: 10000 }]);
  });

  it("allocates partial payments to the oldest outstanding schedule", () => {
    expect(
      allocateRentPayments(
        [
          { id: "s2", dueDate: "2026-10-01", sequence: 2, receivableAmount: 200 },
          { id: "s1", dueDate: "2025-10-01", sequence: 1, receivableAmount: 100 },
        ],
        [
          { id: "p1", paymentDate: "2025-10-01", amount: 60 },
          { id: "p2", paymentDate: "2025-11-01", amount: 50 },
        ],
      ),
    ).toEqual({
      allocations: [
        { rentPaymentId: "p1", rentReceivableScheduleId: "s1", allocatedAmount: 60 },
        { rentPaymentId: "p2", rentReceivableScheduleId: "s1", allocatedAmount: 40 },
        { rentPaymentId: "p2", rentReceivableScheduleId: "s2", allocatedAmount: 10 },
      ],
      unallocatedPayments: [],
    });
  });

  it("uses payment id to order payments made on the same date", () => {
    expect(
      allocateRentPayments(
        [
          { id: "s1", dueDate: "2025-01-01", sequence: 1, receivableAmount: 100 },
          { id: "s2", dueDate: "2025-01-01", sequence: 2, receivableAmount: 100 },
        ],
        [
          { id: "p-b", paymentDate: "2025-01-01", amount: 150 },
          { id: "p-a", paymentDate: "2025-01-01", amount: 50 },
        ],
      ).allocations,
    ).toEqual([
      { rentPaymentId: "p-a", rentReceivableScheduleId: "s1", allocatedAmount: 50 },
      { rentPaymentId: "p-b", rentReceivableScheduleId: "s1", allocatedAmount: 50 },
      { rentPaymentId: "p-b", rentReceivableScheduleId: "s2", allocatedAmount: 100 },
    ]);
  });

  it("applies a future payment as an advance against the oldest schedule", () => {
    expect(
      allocateRentPayments(
        [{ id: "s1", dueDate: "2027-01-01", sequence: 1, receivableAmount: 100 }],
        [{ id: "p1", paymentDate: "2026-01-01", amount: 100 }],
      ),
    ).toEqual({
      allocations: [{ rentPaymentId: "p1", rentReceivableScheduleId: "s1", allocatedAmount: 100 }],
      unallocatedPayments: [],
    });
  });

  it("keeps payments unallocated when there are no schedules", () => {
    expect(
      allocateRentPayments([], [{ id: "p1", paymentDate: "2025-01-01", amount: 10 }]),
    ).toEqual({
      allocations: [],
      unallocatedPayments: [{ rentPaymentId: "p1", amount: 10 }],
    });
  });

  it("preserves one-cent allocations without floating point drift", () => {
    expect(
      allocateRentPayments(
        [
          { id: "s1", dueDate: "2025-01-01", sequence: 1, receivableAmount: 0.01 },
          { id: "s2", dueDate: "2025-02-01", sequence: 2, receivableAmount: 0.02 },
        ],
        [{ id: "p1", paymentDate: "2025-01-01", amount: 0.04 }],
      ),
    ).toEqual({
      allocations: [
        { rentPaymentId: "p1", rentReceivableScheduleId: "s1", allocatedAmount: 0.01 },
        { rentPaymentId: "p1", rentReceivableScheduleId: "s2", allocatedAmount: 0.02 },
      ],
      unallocatedPayments: [{ rentPaymentId: "p1", amount: 0.01 }],
    });
  });
});
