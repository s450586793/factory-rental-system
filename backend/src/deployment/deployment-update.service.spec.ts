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
          "cd /volume1/docker/factory-rental-system && WEB_UPDATE_PROJECT_DIR=/volume1/docker/factory-rental-system docker compose -f docker-compose.ghcr.yml -f docker-compose.web-update.yml pull backend frontend && WEB_UPDATE_PROJECT_DIR=/volume1/docker/factory-rental-system docker compose -f docker-compose.ghcr.yml -f docker-compose.web-update.yml up -d --remove-orphans",
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
});
