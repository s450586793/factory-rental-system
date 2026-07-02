import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { DeploymentUpdateConfig } from "../config/deployment-update.config";
import { DockerEngineHttpClient } from "./docker-engine.client";

export type DockerEngineClient = Pick<
  DockerEngineHttpClient,
  "pullImage" | "createContainer" | "startContainer" | "inspectContainer" | "removeContainer"
>;

export const DOCKER_ENGINE_CLIENT = Symbol("DOCKER_ENGINE_CLIENT");

@Injectable()
export class DeploymentUpdateService {
  constructor(
    @Inject("DEPLOYMENT_UPDATE_CONFIG")
    private readonly config: DeploymentUpdateConfig,
    @Inject(DOCKER_ENGINE_CLIENT)
    private readonly docker: DockerEngineClient,
  ) {}

  async getStatus() {
    const existingContainer = this.config.enabled
      ? await this.docker.inspectContainer(this.config.containerName)
      : null;
    const onlineVersion = await this.fetchOnlineVersion();

    return {
      enabled: this.config.enabled,
      running: Boolean(existingContainer?.State?.Running),
      services: this.config.services,
      composeFiles: this.config.composeFiles,
      ...onlineVersion,
    };
  }

  async startUpdate() {
    this.assertRunnable();

    const existingContainer = await this.docker.inspectContainer(this.config.containerName);
    if (existingContainer?.State?.Running) {
      throw new ConflictException("系统更新已经在执行中，请稍后再试");
    }
    if (existingContainer) {
      await this.docker.removeContainer(this.config.containerName);
    }

    await this.docker.pullImage(this.config.runnerImage);
    const containerId = await this.docker.createContainer(this.config.containerName, this.buildContainerSpec());
    await this.docker.startContainer(containerId);

    return {
      started: true,
      containerName: this.config.containerName,
      message: "系统更新已开始，前端页面可能会短暂断开。",
    };
  }

  private assertRunnable() {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException("Web 更新功能未启用");
    }

    if (!this.config.projectDir || !this.config.projectDir.startsWith("/")) {
      throw new BadRequestException("WEB_UPDATE_PROJECT_DIR 必须配置为宿主机绝对路径");
    }

    if (!this.config.services.length) {
      throw new BadRequestException("WEB_UPDATE_SERVICES 至少需要配置一个服务");
    }

    if (!this.config.composeFiles.length) {
      throw new BadRequestException("WEB_UPDATE_COMPOSE_FILES 至少需要配置一个 compose 文件");
    }
  }

  private buildContainerSpec() {
    const composeArgs = this.config.composeFiles.map((file) => `-f ${quoteShell(file)}`).join(" ");
    const updateEnv = `WEB_UPDATE_PROJECT_DIR=${quoteShell(this.config.projectDir)}`;
    const updateCommand = [
      `cd ${quoteShell(this.config.projectDir)}`,
      `${updateEnv} docker compose ${composeArgs} pull ${this.config.services.map(quoteShell).join(" ")}`,
      `${updateEnv} docker compose ${composeArgs} up -d --remove-orphans`,
    ].join(" && ");

    return {
      Image: this.config.runnerImage,
      Cmd: ["sh", "-lc", updateCommand],
      WorkingDir: this.config.projectDir,
      HostConfig: {
        AutoRemove: true,
        Binds: [
          `${this.config.dockerSocketPath}:/var/run/docker.sock`,
          `${this.config.projectDir}:${this.config.projectDir}`,
        ],
      },
      Labels: {
        "factory-rental-system.role": "web-updater",
      },
    };
  }

  private async fetchOnlineVersion() {
    if (!this.config.onlineVersionUrl) {
      return {
        onlineVersion: null,
        onlineVersionCheckedAt: null,
        onlineVersionError: null,
      };
    }

    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(this.config.onlineVersionUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();
      const versionMatch = content.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
      if (!versionMatch?.[1]) {
        throw new Error("未找到版本号");
      }

      return {
        onlineVersion: versionMatch[1],
        onlineVersionCheckedAt: checkedAt,
        onlineVersionError: null,
      };
    } catch (error) {
      return {
        onlineVersion: null,
        onlineVersionCheckedAt: checkedAt,
        onlineVersionError: error instanceof Error ? error.message : "查询失败",
      };
    }
  }
}

function quoteShell(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
