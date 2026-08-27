import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import type { DeploymentUpdateConfig } from "../config/deployment-update.config";
import { DeploymentUpdateService, type DockerEngineClient } from "./deployment-update.service";

function createConfig(overrides: Partial<DeploymentUpdateConfig> = {}): DeploymentUpdateConfig {
  return {
    enabled: true,
    dockerSocketPath: "/var/run/docker.sock",
    projectDir: "/volume1/docker/factory-rental-system",
    composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
    runnerImage: "docker:27-cli",
    services: ["backend", "frontend"],
    containerName: "factory-rental-updater",
    onlineVersionUrl: "",
    onlineVersionTimeoutMs: 5_000,
    proxyUrl: "",
    noProxy: "",
    ...overrides,
  };
}

function createDockerClient(): jest.Mocked<DockerEngineClient> {
  return {
    pullImage: jest.fn().mockResolvedValue(undefined),
    createContainer: jest.fn().mockResolvedValue("updater-container-id"),
    startContainer: jest.fn().mockResolvedValue(undefined),
    inspectContainer: jest.fn().mockResolvedValue(null),
    removeContainer: jest.fn().mockResolvedValue(undefined),
  };
}

describe("DeploymentUpdateService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reports the configured update capability without exposing Docker internals", () => {
    const service = new DeploymentUpdateService(createConfig(), createDockerClient());

    expect(service.getStatus()).resolves.toEqual({
      enabled: true,
      running: false,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
      onlineVersion: null,
      onlineVersionCheckedAt: null,
      onlineVersionError: null,
    });
  });

  it("reports a running update when the updater container is active", async () => {
    const docker = createDockerClient();
    docker.inspectContainer.mockResolvedValue({ State: { Running: true } });
    const service = new DeploymentUpdateService(createConfig(), docker);

    await expect(service.getStatus()).resolves.toEqual({
      enabled: true,
      running: true,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
      onlineVersion: null,
      onlineVersionCheckedAt: null,
      onlineVersionError: null,
    });
  });

  it("times out online version checks instead of blocking update status", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as typeof fetch;
    const service = new DeploymentUpdateService(
      createConfig({
        onlineVersionUrl: "https://example.com/app-meta.ts",
        onlineVersionTimeoutMs: 5_000,
      }),
      createDockerClient(),
    );

    const statusPromise = service.getStatus();
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(statusPromise).resolves.toMatchObject({
      enabled: true,
      onlineVersion: null,
      onlineVersionError: "查询线上版本超时",
    });

    jest.useRealTimers();
  });

  it("uses the configured proxy when checking the online version", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('export const APP_VERSION = "V9.9.9";'),
    }) as typeof fetch;
    const service = new DeploymentUpdateService(
      createConfig({
        onlineVersionUrl: "https://example.com/app-meta.ts",
        proxyUrl: "http://192.168.0.6:7890",
      }),
      createDockerClient(),
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      onlineVersion: "V9.9.9",
      onlineVersionError: null,
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string | URL | Request,
      RequestInit & { dispatcher?: unknown },
    ];
    expect(init.dispatcher).toBeDefined();
  });


  it("rejects update starts when web updates are disabled", async () => {
    const docker = createDockerClient();
    const service = new DeploymentUpdateService(createConfig({ enabled: false }), docker);

    await expect(service.startUpdate()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it("requires an absolute host project directory before starting an updater", async () => {
    const docker = createDockerClient();
    const service = new DeploymentUpdateService(createConfig({ projectDir: "" }), docker);

    await expect(service.startUpdate()).rejects.toBeInstanceOf(BadRequestException);
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it("rejects duplicate starts while the updater container is still running", async () => {
    const docker = createDockerClient();
    docker.inspectContainer.mockResolvedValue({ State: { Running: true } });
    const service = new DeploymentUpdateService(createConfig(), docker);

    await expect(service.startUpdate()).rejects.toBeInstanceOf(ConflictException);
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it("removes a stopped updater container before starting a new update", async () => {
    const docker = createDockerClient();
    docker.inspectContainer.mockResolvedValue({ State: { Running: false } });
    const service = new DeploymentUpdateService(createConfig(), docker);

    await service.startUpdate();

    expect(docker.removeContainer).toHaveBeenCalledWith("factory-rental-updater");
    expect(docker.createContainer).toHaveBeenCalled();
  });

  it("starts a detached updater container that pulls and recreates the compose services", async () => {
    const docker = createDockerClient();
    const service = new DeploymentUpdateService(createConfig(), docker);

    await expect(service.startUpdate()).resolves.toEqual({
      started: true,
      containerName: "factory-rental-updater",
      message: "系统更新已开始，前端页面可能会短暂断开。",
    });

    expect(docker.pullImage).toHaveBeenCalledWith("docker:27-cli");
    expect(docker.createContainer).toHaveBeenCalledWith(
      "factory-rental-updater",
      expect.objectContaining({
        Image: "docker:27-cli",
        WorkingDir: "/volume1/docker/factory-rental-system",
        Cmd: [
          "sh",
          "-lc",
          "cd /volume1/docker/factory-rental-system && WEB_UPDATE_PROJECT_DIR=/volume1/docker/factory-rental-system docker compose -f docker-compose.ghcr.yml -f docker-compose.web-update.yml pull backend frontend && WEB_UPDATE_PROJECT_DIR=/volume1/docker/factory-rental-system docker compose -f docker-compose.ghcr.yml -f docker-compose.web-update.yml up -d --no-deps --remove-orphans backend frontend",
        ],
        HostConfig: expect.objectContaining({
          AutoRemove: true,
          Binds: [
            "/var/run/docker.sock:/var/run/docker.sock",
            "/volume1/docker/factory-rental-system:/volume1/docker/factory-rental-system",
          ],
        }),
      }),
    );
    expect(docker.startContainer).toHaveBeenCalledWith("updater-container-id");
  });

  it("passes proxy environment variables to the updater container", async () => {
    const docker = createDockerClient();
    const service = new DeploymentUpdateService(
      createConfig({
        proxyUrl: "http://192.168.0.6:7890",
        noProxy: "localhost,127.0.0.1,postgres",
      }),
      docker,
    );

    await service.startUpdate();

    expect(docker.createContainer).toHaveBeenCalledWith(
      "factory-rental-updater",
      expect.objectContaining({
        Env: [
          "HTTP_PROXY=http://192.168.0.6:7890",
          "HTTPS_PROXY=http://192.168.0.6:7890",
          "NO_PROXY=localhost,127.0.0.1,postgres",
        ],
      }),
    );
  });
});
