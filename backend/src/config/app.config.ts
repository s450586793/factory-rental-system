import { registerAs } from "@nestjs/config";
import { readBoolean, readNumber, readString, splitCsv } from "./env.helpers";

export type AppConfig = {
  name: string;
  environment: string;
  port: number;
  frontendOrigins: string[];
  apiDocsEnabled: boolean;
};

export function resolveAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const environment = readString(env, "NODE_ENV", { defaultValue: "development" });

  return {
    name: readString(env, "APP_NAME", { defaultValue: "factory-rental-system" }),
    environment,
    port: readNumber(env, "PORT", { defaultValue: 3000, minimum: 1 }),
    frontendOrigins: splitCsv(env.FRONTEND_ORIGIN),
    apiDocsEnabled: readBoolean(env, "API_DOCS_ENABLED", environment !== "production"),
  };
}

export default registerAs("app", () => resolveAppConfig(process.env));
