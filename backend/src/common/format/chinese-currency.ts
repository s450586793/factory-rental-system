const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"] as const;
const SMALL_UNITS = ["", "拾", "佰", "仟"] as const;
const LARGE_UNITS = ["", "万", "亿", "兆"] as const;

function convertSection(section: number) {
  let text = "";
  let unitIndex = 0;
  let pendingZero = false;

  while (section > 0) {
    const digit = section % 10;
    if (digit === 0) {
      if (text && !pendingZero) {
        pendingZero = true;
      }
    } else {
      text = `${pendingZero ? "零" : ""}${DIGITS[digit]}${SMALL_UNITS[unitIndex]}${text}`;
      pendingZero = false;
    }

    unitIndex += 1;
    section = Math.floor(section / 10);
  }

  return text;
}

function convertInteger(integer: number) {
  if (integer === 0) {
    return "零";
  }

  let remaining = integer;
  let unitIndex = 0;
  let text = "";
  let pendingZero = false;

  while (remaining > 0) {
    const section = remaining % 10000;
    if (section === 0) {
      if (text) {
        pendingZero = true;
      }
    } else {
      const sectionText = convertSection(section);
      text = `${sectionText}${LARGE_UNITS[unitIndex]}${pendingZero ? "零" : ""}${text}`;
      pendingZero = section < 1000;
    }

    unitIndex += 1;
    remaining = Math.floor(remaining / 10000);
  }

  return text.replace(/零+/g, "零").replace(/零$/g, "");
}

export function toChineseCurrencyUppercase(amount: number) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) {
    return "零元整";
  }

  const isNegative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const integer = Math.floor(cents / 100);
  const decimal = cents % 100;
  const jiao = Math.floor(decimal / 10);
  const fen = decimal % 10;

  let text = `${convertInteger(integer)}元`;

  if (decimal === 0) {
    text += "整";
  } else {
    if (jiao > 0) {
      text += `${DIGITS[jiao]}角`;
    }
    if (fen > 0) {
      if (jiao === 0) {
        text += integer > 0 ? "零" : "";
      }
      text += `${DIGITS[fen]}分`;
    }
  }

  return isNegative ? `负${text}` : text;
}
