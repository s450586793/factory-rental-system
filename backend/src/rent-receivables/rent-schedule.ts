import { fromCents, toCents } from "../common/money/cents";
import { BillingFrequency } from "../contracts/contract.enums";

export type RentScheduleSource = {
  startDate: string;
  endDate: string;
  annualRent: number;
  billingFrequency: BillingFrequency;
};

export type GeneratedRentSchedule = {
  sequence: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  receivableAmount: number;
};

type IsoDateParts = {
  year: number;
  month: number;
  day: number;
};

function parseIsoDate(value: string): IsoDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("日期格式无效");
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("日期格式无效");
  }

  return { year, month, day };
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addLeaseMonths(startDate: IsoDateParts, months: number): string {
  const monthIndex = startDate.year * 12 + startDate.month - 1 + months;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = Math.min(startDate.day, daysInMonth(year, month));

  return formatIsoDate(new Date(Date.UTC(year, month - 1, day)));
}

function previousIsoDate(value: string): string {
  const { year, month, day } = parseIsoDate(value);
  return formatIsoDate(new Date(Date.UTC(year, month - 1, day - 1)));
}

function minIsoDate(left: string, right: string): string {
  return left < right ? left : right;
}

export function buildRentSchedule(source: RentScheduleSource): GeneratedRentSchedule[] {
  const startDate = parseIsoDate(source.startDate);
  parseIsoDate(source.endDate);
  if (source.startDate > source.endDate) {
    throw new Error("合同结束日期不能早于开始日期");
  }

  const annualRentCents = toCents(source.annualRent);
  if (!Number.isFinite(annualRentCents) || annualRentCents <= 0) {
    throw new Error("年租金必须大于 0");
  }

  const isSemiannual = source.billingFrequency === BillingFrequency.SEMIANNUAL;
  const intervalMonths = isSemiannual ? 6 : 12;
  const amounts = isSemiannual
    ? [Math.ceil(annualRentCents / 2), Math.floor(annualRentCents / 2)]
    : [annualRentCents];
  const periods: GeneratedRentSchedule[] = [];

  for (let index = 0; ; index += 1) {
    const periodStart = addLeaseMonths(startDate, index * intervalMonths);
    if (periodStart > source.endDate) {
      break;
    }

    const nextStart = addLeaseMonths(startDate, (index + 1) * intervalMonths);
    periods.push({
      sequence: index + 1,
      periodStart,
      periodEnd: minIsoDate(source.endDate, previousIsoDate(nextStart)),
      dueDate: periodStart,
      receivableAmount: fromCents(amounts[index % amounts.length]),
    });
  }

  return periods;
}
