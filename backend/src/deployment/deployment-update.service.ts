import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ProxyAgent } from "undici";
import type { DeploymentUpdateConfig } from "../config/deployment-update.config";
import { DockerEngineHttpClient, type DockerContainer } from "./docker-engine.client";
import { buildUpdateScript } from "./update-script";

export type DockerEngineClient = Pick<DockerEngineHttpClient,
  "pullImage" | "createContainer" | "startContainer" | "inspectContainer" | "removeContainer" | "containerLogs">;
export const DOCKER_ENGINE_CLIENT = Symbol("DOCKER_ENGINE_CLIENT");

export type ReleaseManifest = {
  schemaVersion: 1;
  version: string;
  revision: string;
  images: { backend: string; frontend: string };
};

type UpdateResult = {
  status: "succeeded" | "failed";
  exitCode: number | null;
  message: string;
  logs: string;
  revision: string | null;
  version: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

@Injectable()
export class DeploymentUpdateService {
  private starting = false;
  private startFailure: UpdateResult | null = null;

  constructor(
    @Inject("DEPLOYMENT_UPDATE_CONFIG") private readonly config: DeploymentUpdateConfig,
    @Inject(DOCKER_ENGINE_CLIENT) private readonly docker: DockerEngineClient,
  ) {}

  async getStatus() {
    const container = this.config.enabled ? await this.docker.inspectContainer(this.config.containerName) : null;
    const release = await this.fetchRelease();
    const running = this.starting || Boolean(container?.State?.Running);
    return {
      enabled: this.config.enabled,
      running,
      phase: this.starting ? "starting" : container?.State?.Running ? await this.readPhase() : null,
      services: this.config.services,
      composeFiles: this.config.composeFiles,
      onlineVersion: release.manifest?.version ?? null,
      onlineRevision: release.manifest?.revision ?? null,
      onlineVersionCheckedAt: release.checkedAt,
      onlineVersionError: release.error,
      result: running ? null : this.startFailure ?? await this.readResult(container),
    };
  }

  async startUpdate() {
    this.assertRunnable();
    if (this.starting) throw new ConflictException("系统更新已经在执行中，请稍后再试");
    // 在第一个 await 前加锁，覆盖查询版本和拉取 runner 镜像的窗口。
    this.starting = true;
    let target: ReleaseManifest | null = null;
    let containerCreated = false;
    try {
      const existing = await this.docker.inspectContainer(this.config.containerName);
      if (existing?.State?.Running) throw new ConflictException("系统更新已经在执行中，请稍后再试");
      const release = await this.fetchRelease();
      if (!release.manifest) throw new ServiceUnavailableException(release.error || "未找到已发布版本清单");
      target = release.manifest;
      await this.docker.pullImage(this.config.runnerImage);
      if (existing) await this.docker.removeContainer(this.config.containerName);
      const id = await this.docker.createContainer(this.config.containerName, this.buildContainerSpec(target));
      containerCreated = true;
      await this.docker.startContainer(id);
      this.startFailure = null;
      return {
        started: true,
        containerName: this.config.containerName,
        message: "系统更新已开始，前端页面可能会短暂断开。",
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      // Docker start 超时可能发生在实际启动之后，保留容器让后续查询确认结果。
      if (!containerCreated) {
        this.startFailure = {
          status: "failed", exitCode: null, message: "启动更新失败，请检查发布清单或镜像拉取后重试。",
          logs: this.redact(error instanceof Error ? error.message : "启动失败"),
          revision: target?.revision ?? null, version: target?.version ?? null,
          startedAt: null, finishedAt: new Date().toISOString(),
        };
      }
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("更新启动失败或请求超时，请刷新状态确认后重试。");
    } finally {
      this.starting = false;
    }
  }

  private assertRunnable() {
    if (!this.config.enabled) throw new ServiceUnavailableException("Web 更新功能未启用");
    if (!this.config.projectDir.startsWith("/")) throw new BadRequestException("WEB_UPDATE_PROJECT_DIR 必须配置为宿主机绝对路径");
    if (this.config.services.length !== 2 || !["backend", "frontend"].every((name) => this.config.services.includes(name))) {
      throw new BadRequestException("WEB_UPDATE_SERVICES 必须仅包含 backend,frontend，数据库不参与更新");
    }
    if (!this.config.composeFiles.length || this.config.composeFiles.some((file) => file.startsWith("-"))) {
      throw new BadRequestException("WEB_UPDATE_COMPOSE_FILES 必须配置有效的 compose 文件");
    }
  }

  private buildContainerSpec(manifest: ReleaseManifest) {
    return {
      Image: this.config.runnerImage,
      Cmd: ["timeout", "-s", "TERM", "-k", "10", String(this.config.updateTimeoutSeconds), "sh", "-c", buildUpdateScript(this.config, manifest)],
      Tty: true,
      Env: [
        `WEB_UPDATE_PROJECT_DIR=${this.config.projectDir}`,
        ...(this.config.proxyUrl ? [`HTTP_PROXY=${this.config.proxyUrl}`, `HTTPS_PROXY=${this.config.proxyUrl}`] : []),
        ...(this.config.noProxy ? [`NO_PROXY=${this.config.noProxy}`] : []),
      ],
      WorkingDir: this.config.projectDir,
      HostConfig: {
        AutoRemove: false,
        LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "1" } },
        Binds: [`${this.config.dockerSocketPath}:/var/run/docker.sock`, `${this.config.projectDir}:${this.config.projectDir}`],
      },
      Labels: {
        "factory-rental-system.role": "web-updater",
        "factory-rental-system.revision": manifest.revision,
        "factory-rental-system.version": manifest.version,
      },
    };
  }

  private async readResult(container: DockerContainer | null): Promise<UpdateResult | null> {
    if (!container) return null;
    const exitCode = container.State?.ExitCode ?? null;
    const neverStarted = !container.State?.StartedAt || container.State.StartedAt.startsWith("0001-");
    let logs: string;
    try { logs = this.redact(await this.docker.containerLogs(this.config.containerName)); }
    catch { logs = "更新日志暂时无法读取。"; }
    const succeeded = exitCode === 0 && !neverStarted;
    return {
      status: succeeded ? "succeeded" : "failed",
      exitCode,
      message: succeeded ? "系统更新成功，两个服务均已通过健康与版本校验。"
        : neverStarted ? "更新容器未成功启动，请重试。"
          : exitCode === 124 || exitCode === 137 || exitCode === 143 ? "系统更新超时，请检查日志和服务状态。"
            : exitCode === 42 ? "更新后健康或版本校验超时，请检查服务状态。"
              : exitCode === 43 ? "更新前备份脚本缺失，请安装备份脚本后重试。" : "系统更新失败，请查看日志后重试。",
      logs,
      revision: container.Config?.Labels?.["factory-rental-system.revision"] ?? null,
      version: container.Config?.Labels?.["factory-rental-system.version"] ?? null,
      startedAt: neverStarted ? null : container.State?.StartedAt ?? null,
      finishedAt: container.State?.FinishedAt ?? null,
    };
  }

  private async readPhase() {
    try {
      const logs = await this.docker.containerLogs(this.config.containerName);
      if (logs.includes("Waiting for both services")) return "checking-health";
      if (logs.includes("Starting application services")) return "starting-services";
      if (logs.includes("Creating and verifying pre-update backup")) return "backing-up";
      if (logs.includes("Pulling published backend")) return "pulling";
    } catch { /* 日志暂不可用时保留执行中状态，继续轮询。 */ }
    return "updating";
  }

  private redact(value: string) {
    let safe = value.split("\u001b").map((part) => part.replace(/^\[[0-9;]*[A-Za-z]/, "")).join("")
      .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
      .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [REDACTED]")
      .replace(/((?:[\w-]*(?:password|passwd|secret|token|api[_-]?key)[\w-]*|authorization)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]");
    safe = Array.from(safe).filter((character) => [9, 10, 13].includes(character.charCodeAt(0))
      || (character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)).join("");
    if (this.config.proxyUrl) safe = safe.replaceAll(this.config.proxyUrl, "[PROXY]");
    return safe.slice(-12_000);
  }

  private async fetchRelease(): Promise<{ manifest: ReleaseManifest | null; checkedAt: string | null; error: string | null }> {
    if (!this.config.onlineVersionUrl) return { manifest: null, checkedAt: null, error: null };
    const checkedAt = new Date().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.onlineVersionTimeoutMs);
    const proxy = this.config.proxyUrl ? new ProxyAgent(this.config.proxyUrl) : undefined;
    try {
      const response = await fetch(this.config.onlineVersionUrl, { ...(proxy ? { dispatcher: proxy } : {}), signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest: unknown = await response.json();
      if (!isReleaseManifest(manifest)) throw new Error("发布清单无效，必须包含同一提交的两个镜像 digest");
      return { manifest, checkedAt, error: null };
    } catch (error) {
      return {
        manifest: null, checkedAt,
        error: controller.signal.aborted ? "查询线上版本超时" : this.redact(error instanceof Error ? error.message : "查询失败"),
      };
    } finally {
      clearTimeout(timeout);
      if (proxy) void proxy.close().catch(() => undefined);
    }
  }
}

function isReleaseManifest(value: unknown): value is ReleaseManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<ReleaseManifest>;
  const imagePattern = /^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+@sha256:[a-f0-9]{64}$/;
  return manifest.schemaVersion === 1 && typeof manifest.version === "string" && /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/i.test(manifest.version)
    && typeof manifest.revision === "string" && /^[a-f0-9]{40}$/.test(manifest.revision)
    && typeof manifest.images?.backend === "string" && imagePattern.test(manifest.images.backend)
    && typeof manifest.images?.frontend === "string" && imagePattern.test(manifest.images.frontend)
    && manifest.images.backend !== manifest.images.frontend;
}
