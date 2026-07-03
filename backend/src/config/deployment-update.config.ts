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
        "https://raw.githubusercontent.com/s450586793/factory-rental-system/main/frontend/src/config/app-meta.ts",
    }),
    onlineVersionTimeoutMs: readNumber(env, "WEB_UPDATE_ONLINE_VERSION_TIMEOUT_MS", {
      defaultValue: 5_000,
      minimum: 1_000,
    }),
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

export default registerAs("deploymentUpdate", () => resolveDeploymentUpdateConfig(process.env));
