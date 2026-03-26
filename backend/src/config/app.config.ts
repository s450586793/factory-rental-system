import { registerAs } from "@nestjs/config";
import { readNumber, readString, splitCsv } from "./env.helpers";

export type AppConfig = {
  name: string;
  environment: string;
  port: number;
  frontendOrigins: string[];
};

export function resolveAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    name: readString(env, "APP_NAME", { defaultValue: "factory-rental-system" }),
    environment: readString(env, "NODE_ENV", { defaultValue: "development" }),
    port: readNumber(env, "PORT", { defaultValue: 3000, minimum: 1 }),
    frontendOrigins: splitCsv(env.FRONTEND_ORIGIN),
  };
}

export default registerAs("app", () => resolveAppConfig(process.env));
