type StringOptions = {
  defaultValue?: string;
  allowEmpty?: boolean;
};

type NumberOptions = {
  defaultValue?: number;
  minimum?: number;
};

export function readString(env: NodeJS.ProcessEnv, key: string, options: StringOptions = {}) {
  const raw = env[key]?.trim();

  if (!raw) {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    if (options.allowEmpty) {
      return "";
    }
    throw new Error(`缺少环境变量 ${key}`);
  }

  return raw;
}

export function readOptionalString(env: NodeJS.ProcessEnv, key: string) {
  const raw = env[key]?.trim();
  return raw ? raw : undefined;
}

export function readNumber(env: NodeJS.ProcessEnv, key: string, options: NumberOptions = {}) {
  const raw = env[key]?.trim();
  const value = raw ? Number(raw) : options.defaultValue;

  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`环境变量 ${key} 必须是数字`);
  }

  if (options.minimum !== undefined && value < options.minimum) {
    throw new Error(`环境变量 ${key} 不能小于 ${options.minimum}`);
  }

  return value;
}

export function readBoolean(env: NodeJS.ProcessEnv, key: string, defaultValue = false) {
  const raw = env[key]?.trim().toLowerCase();

  if (!raw) {
    return defaultValue;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error(`环境变量 ${key} 必须是 true 或 false`);
}

export function splitCsv(raw?: string) {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
