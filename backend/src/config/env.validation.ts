import { resolveAppConfig } from "./app.config";
import { resolveAuthConfig } from "./auth.config";
import { resolveDatabaseConfig } from "./database.config";
import { resolveDeploymentUpdateConfig } from "./deployment-update.config";
import { resolveStorageConfig } from "./storage.config";

export function validateEnvironment(env: Record<string, unknown>) {
  const runtimeEnv = { ...env } as NodeJS.ProcessEnv;
  const environment = runtimeEnv.NODE_ENV?.trim() || "development";
  if (!runtimeEnv.COOKIE_SECURE?.trim()) {
    runtimeEnv.COOKIE_SECURE = environment === "production" ? "true" : "false";
  }
  if (!runtimeEnv.API_DOCS_ENABLED?.trim()) {
    runtimeEnv.API_DOCS_ENABLED = environment === "production" ? "false" : "true";
  }

  resolveAppConfig(runtimeEnv);
  resolveAuthConfig(runtimeEnv);
  resolveDatabaseConfig(runtimeEnv);
  resolveStorageConfig(runtimeEnv);
  resolveDeploymentUpdateConfig(runtimeEnv);
  return runtimeEnv;
}
