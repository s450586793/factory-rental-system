function extractDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: "year" | "month" | "day",
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatShanghaiDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = extractDatePart(parts, "year");
  const month = extractDatePart(parts, "month");
  const day = extractDatePart(parts, "day");

  return `${year}-${month}-${day}`;
}
