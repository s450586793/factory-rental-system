import { registerAs } from "@nestjs/config";
import { readBoolean, readString, splitCsv } from "./env.helpers";

export type DeploymentUpdateConfig = {
  enabled: boolean;
  dockerSocketPath: string;
  projectDir: string;
  composeFiles: string[];
  runnerImage: string;
  services: string[];
  containerName: string;
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
  };
}

export default registerAs("deploymentUpdate", () => resolveDeploymentUpdateConfig(process.env));
