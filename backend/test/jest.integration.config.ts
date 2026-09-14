import type { Config } from "jest";

const config: Config = {
  rootDir: "..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }] },
  testTimeout: 180_000,
  maxWorkers: 1,
};
export default config;
