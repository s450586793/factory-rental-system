import { registerAs } from "@nestjs/config";
import { readBoolean, readString } from "./env.helpers";

export type AuthConfig = {
  jwtSecret: string;
  cookieSecure: boolean;
  cookieName: string;
  adminUsername: string;
  adminPassword: string;
};

export function resolveAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  return {
    jwtSecret: readString(env, "JWT_SECRET"),
    cookieSecure: readBoolean(env, "COOKIE_SECURE", false),
    cookieName: readString(env, "COOKIE_NAME", { defaultValue: "token" }),
    adminUsername: readString(env, "ADMIN_USERNAME", { defaultValue: "admin" }),
    adminPassword: readString(env, "ADMIN_PASSWORD"),
  };
}

export default registerAs("auth", () => resolveAuthConfig(process.env));
