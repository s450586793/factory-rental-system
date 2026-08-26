export type BillingFrequency = "annual" | "semiannual";

export type RentSchedulePreview = {
  count: number;
  firstDueDate: string | null;
};

type IsoDateParts = {
  year: number;
  month: number;
  day: number;
};

function parseIsoDate(value: string): IsoDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addLeaseMonths(startDate: IsoDateParts, months: number) {
  const monthIndex = startDate.year * 12 + startDate.month - 1 + months;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = Math.min(startDate.day, daysInMonth(year, month));
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function buildRentSchedulePreview(
  startDate: string,
  endDate: string,
  frequency: BillingFrequency,
): RentSchedulePreview {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || startDate > endDate) {
    return { count: 0, firstDueDate: null };
  }

  const intervalMonths = frequency === "semiannual" ? 6 : 12;
  let count = 0;
  while (addLeaseMonths(start, count * intervalMonths) <= endDate) {
    count += 1;
  }

  return { count, firstDueDate: startDate };
}
