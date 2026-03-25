import { ValueTransformer } from "typeorm";

export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => (value === undefined || value === null ? null : value),
  from: (value?: string | number | null) => (value === undefined || value === null ? 0 : Number(value)),
};
