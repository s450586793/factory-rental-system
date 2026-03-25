export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "--";
  }
  return value;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
