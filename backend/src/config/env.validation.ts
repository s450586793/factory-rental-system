import { resolveAppConfig } from "./app.config";
import { resolveAuthConfig } from "./auth.config";
import { resolveDatabaseConfig } from "./database.config";
import { resolveStorageConfig } from "./storage.config";

export function validateEnvironment(env: Record<string, unknown>) {
  const runtimeEnv = env as NodeJS.ProcessEnv;
  resolveAppConfig(runtimeEnv);
  resolveAuthConfig(runtimeEnv);
  resolveDatabaseConfig(runtimeEnv);
  resolveStorageConfig(runtimeEnv);
  return env;
}
