import { registerAs } from "@nestjs/config";
import { readBoolean, readNumber, readString, splitCsv } from "./env.helpers";

export type DeploymentUpdateConfig = {
  enabled: boolean;
  dockerSocketPath: string;
  projectDir: string;
  composeFiles: string[];
  runnerImage: string;
  services: string[];
  containerName: string;
  onlineVersionUrl: string;
  onlineVersionTimeoutMs: number;
  dockerRequestTimeoutMs: number;
  updateTimeoutSeconds: number;
  healthTimeoutSeconds: number;
  backupEnabled: boolean;
  proxyUrl: string;
  noProxy: string;
};

export function resolveDeploymentUpdateConfig(env: NodeJS.ProcessEnv): DeploymentUpdateConfig {
  return {
    enabled: readBoolean(env, "WEB_UPDATE_ENABLED", false),
    dockerSocketPath: readString(env, "WEB_UPDATE_DOCKER_SOCKET", {
      defaultValue: "/var/run/docker.sock",
    }),
    projectDir: readString(env, "WEB_UPDATE_PROJECT_DIR", {
      defaultValue: "",
      allowEmpty: true,
    }),
    composeFiles: splitCsv(env.WEB_UPDATE_COMPOSE_FILES || env.WEB_UPDATE_COMPOSE_FILE || "docker-compose.ghcr.yml"),
    runnerImage: readString(env, "WEB_UPDATE_RUNNER_IMAGE", {
      defaultValue: "docker:27-cli",
    }),
    services: splitCsv(env.WEB_UPDATE_SERVICES || "backend,frontend"),
    containerName: readString(env, "WEB_UPDATE_CONTAINER_NAME", {
      defaultValue: "factory-rental-updater",
    }),
    onlineVersionUrl: readString(env, "WEB_UPDATE_ONLINE_VERSION_URL", {
      defaultValue:
        "https://github.com/s450586793/factory-rental-system/releases/latest/download/release-manifest.json",
    }),
    onlineVersionTimeoutMs: readNumber(env, "WEB_UPDATE_ONLINE_VERSION_TIMEOUT_MS", {
      defaultValue: 5_000,
      minimum: 1_000,
    }),
    dockerRequestTimeoutMs: readTimeout(env, "WEB_UPDATE_DOCKER_TIMEOUT_MS", 120_000),
    updateTimeoutSeconds: readTimeout(env, "WEB_UPDATE_TIMEOUT_SECONDS", 900),
    healthTimeoutSeconds: readTimeout(env, "WEB_UPDATE_HEALTH_TIMEOUT_SECONDS", 300),
    backupEnabled: readBoolean(env, "WEB_UPDATE_BACKUP_ENABLED", true),
    proxyUrl: readString(env, "WEB_UPDATE_PROXY_URL", {
      defaultValue: env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy || "",
      allowEmpty: true,
    }),
    noProxy: readString(env, "WEB_UPDATE_NO_PROXY", {
      defaultValue: env.NO_PROXY || env.no_proxy || "",
      allowEmpty: true,
    }),
  };
}

function readTimeout(env: NodeJS.ProcessEnv, key: string, defaultValue: number) {
  const value = readNumber(env, key, { defaultValue, minimum: 1 });
  if (!Number.isSafeInteger(value)) {
    throw new Error(`环境变量 ${key} 必须是有限正整数`);
  }
  return value;
}

export default registerAs("deploymentUpdate", () => resolveDeploymentUpdateConfig(process.env));
