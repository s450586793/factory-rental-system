export function toCents(value: number): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(value: number): number {
  return Number((value / 100).toFixed(2));
}
