import { registerAs } from "@nestjs/config";
import { readBoolean, readNumber, readString } from "./env.helpers";

export type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  synchronize: boolean;
};

export function resolveDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseConfig {
  return {
    host: readString(env, "DB_HOST", { defaultValue: "postgres" }),
    port: readNumber(env, "DB_PORT", { defaultValue: 5432, minimum: 1 }),
    database: readString(env, "DB_NAME", { defaultValue: "factory_rental" }),
    username: readString(env, "DB_USER", { defaultValue: "postgres" }),
    password: readString(env, "DB_PASSWORD"),
    synchronize: readBoolean(env, "DB_SYNCHRONIZE", false),
  };
}

export default registerAs("database", () => resolveDatabaseConfig(process.env));
