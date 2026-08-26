import { fromCents, toCents } from "../common/money/cents";

export type AllocationSchedule = {
  id: string;
  dueDate: string;
  sequence: number;
  receivableAmount: number;
};

export type AllocationPayment = {
  id: string;
  paymentDate: string;
  amount: number;
};

export type RentAllocation = {
  rentPaymentId: string;
  rentReceivableScheduleId: string;
  allocatedAmount: number;
};

export type UnallocatedPayment = {
  rentPaymentId: string;
  amount: number;
};

export type RentAllocationResult = {
  allocations: RentAllocation[];
  unallocatedPayments: UnallocatedPayment[];
};

function comparePayments(left: AllocationPayment, right: AllocationPayment): number {
  return left.paymentDate.localeCompare(right.paymentDate) || left.id.localeCompare(right.id);
}

function compareSchedules(left: AllocationSchedule, right: AllocationSchedule): number {
  return left.dueDate.localeCompare(right.dueDate) || left.sequence - right.sequence;
}

export function allocateRentPayments(
  schedules: AllocationSchedule[],
  payments: AllocationPayment[],
): RentAllocationResult {
  const sortedSchedules = [...schedules].sort(compareSchedules);
  const remainingBySchedule = new Map(
    sortedSchedules.map((schedule) => [schedule.id, toCents(schedule.receivableAmount)]),
  );
  const allocations: RentAllocation[] = [];
  const unallocatedPayments: UnallocatedPayment[] = [];

  for (const payment of [...payments].sort(comparePayments)) {
    let remaining = toCents(payment.amount);

    for (const schedule of sortedSchedules) {
      const available = remainingBySchedule.get(schedule.id) ?? 0;
      const allocated = Math.min(remaining, available);

      if (allocated > 0) {
        allocations.push({
          rentPaymentId: payment.id,
          rentReceivableScheduleId: schedule.id,
          allocatedAmount: fromCents(allocated),
        });
        remainingBySchedule.set(schedule.id, available - allocated);
        remaining -= allocated;
      }

      if (remaining === 0) {
        break;
      }
    }

    if (remaining > 0) {
      unallocatedPayments.push({ rentPaymentId: payment.id, amount: fromCents(remaining) });
    }
  }

  return { allocations, unallocatedPayments };
}
