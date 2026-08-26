export type ContractRentSource = {
  startDate: string;
  endDate: string;
  annualRent: number;
};

export type AccruedRentPeriod = {
  startDate: string;
  endDate: string;
  receivableAmount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addLeaseYears(startDate: Date, years: number) {
  return new Date(
    Date.UTC(startDate.getUTCFullYear() + years, startDate.getUTCMonth(), startDate.getUTCDate()),
  );
}

export function buildAccruedRentPeriods(
  contract: ContractRentSource,
  asOfDate: string,
): AccruedRentPeriod[] {
  const contractStart = parseIsoDate(contract.startDate);
  const contractEnd = parseIsoDate(contract.endDate);
  const accruedThrough = parseIsoDate(asOfDate);
  const annualRent = Number((Math.round(Number(contract.annualRent) * 100) / 100).toFixed(2));
  const periods: AccruedRentPeriod[] = [];

  for (let yearIndex = 0; ; yearIndex += 1) {
    const periodStart = addLeaseYears(contractStart, yearIndex);
    if (periodStart > contractEnd || periodStart > accruedThrough) {
      break;
    }

    const nextPeriodStart = addLeaseYears(contractStart, yearIndex + 1);
    const periodEnd = new Date(Math.min(contractEnd.getTime(), nextPeriodStart.getTime() - DAY_MS));
    periods.push({
      startDate: formatIsoDate(periodStart),
      endDate: formatIsoDate(periodEnd),
      receivableAmount: annualRent,
    });
  }

  return periods;
}

export function calculateAccruedReceivable(contract: ContractRentSource, asOfDate: string) {
  const annualRentCents = Math.round(Number(contract.annualRent) * 100);
  return Number(((buildAccruedRentPeriods(contract, asOfDate).length * annualRentCents) / 100).toFixed(2));
}
