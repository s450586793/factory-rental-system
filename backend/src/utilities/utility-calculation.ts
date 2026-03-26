export type UtilityCalculationInput = {
  previousReading: number;
  currentReading: number;
  multiplier: number;
  unitPrice: number;
  lineLossPercent: number;
};

export type UtilityCalculationResult = {
  usage: number;
  adjustedUsage: number;
  amount: number;
};

export function round2(value: number) {
  return Number(value.toFixed(2));
}

export function calculateUtilityCharge(input: UtilityCalculationInput): UtilityCalculationResult {
  const usage = round2((input.currentReading - input.previousReading) * input.multiplier);
  const adjustedUsage = round2(usage * (1 + input.lineLossPercent / 100));
  const amount = round2(adjustedUsage * input.unitPrice);

  return {
    usage,
    adjustedUsage,
    amount,
  };
}
