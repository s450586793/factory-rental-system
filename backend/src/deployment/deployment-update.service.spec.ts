import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { resolveDeploymentUpdateConfig } from "../config/deployment-update.config";
import { DeploymentUpdateService, type DockerEngineClient, type ReleaseManifest } from "./deployment-update.service";

const manifest: ReleaseManifest = {
  schemaVersion: 1, version: "V9.9.9", revision: "a".repeat(40),
  images: { backend: `ghcr.io/example/app-backend@sha256:${"b".repeat(64)}`, frontend: `ghcr.io/example/app-frontend@sha256:${"c".repeat(64)}` },
};
const config = () => resolveDeploymentUpdateConfig({
  WEB_UPDATE_ENABLED: "true", WEB_UPDATE_PROJECT_DIR: "/volume4/docker/docker/rent",
  WEB_UPDATE_COMPOSE_FILES: "compose.yaml", WEB_UPDATE_ONLINE_VERSION_URL: "https://example.com/release-manifest.json",
});

function dockerClient(): jest.Mocked<DockerEngineClient> {
  return {
    pullImage: jest.fn().mockResolvedValue(undefined),
    createContainer: jest.fn().mockResolvedValue("runner-id"),
    startContainer: jest.fn().mockResolvedValue(undefined),
    inspectContainer: jest.fn().mockResolvedValue(null),
    removeContainer: jest.fn().mockResolvedValue(undefined),
    containerLogs: jest.fn().mockResolvedValue(""),
  };
}

describe("DeploymentUpdateService", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(manifest) });
  });
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

  it("reports the published pair revision and preserves disabled update capability", async () => {
    const docker = dockerClient();
    const service = new DeploymentUpdateService({ ...config(), enabled: false }, docker);
    await expect(service.getStatus()).resolves.toMatchObject({
      enabled: false, running: false, onlineVersion: "V9.9.9", onlineRevision: manifest.revision, result: null,
    });
    expect(docker.inspectContainer).not.toHaveBeenCalled();
  });

  it.each([
    'export const APP_VERSION = "V9.9.9";',
    { ...manifest, images: { ...manifest.images, frontend: "ghcr.io/example/frontend:latest" } },
    { ...manifest, revision: "not-a-commit" },
  ])("rejects unpublished version source or invalid pair %j", async (invalid) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(invalid) });
    const docker = dockerClient();
    const service = new DeploymentUpdateService(config(), docker);
    await expect(service.getStatus()).resolves.toMatchObject({ onlineVersion: null, onlineVersionError: expect.stringContaining("发布清单无效") });
    await expect(service.startUpdate()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(docker.pullImage).not.toHaveBeenCalled();
  });

  it("bounds online release checks with an abort timeout", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const status = new DeploymentUpdateService(config(), dockerClient()).getStatus();
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(status).resolves.toMatchObject({ onlineVersionError: "查询线上版本超时" });
  });

  it("uses the configured proxy", async () => {
    await new DeploymentUpdateService({ ...config(), proxyUrl: "http://localhost:7890" }, dockerClient()).getStatus();
    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ dispatcher: expect.anything() }));
  });

  it("reports the running health verification stage without a completed result", async () => {
    const docker = dockerClient();
    docker.inspectContainer.mockResolvedValue({ State: { Running: true } });
    docker.containerLogs.mockResolvedValue("Pulling published backend and frontend images\nWaiting for both services to be healthy at the published revision");
    await expect(new DeploymentUpdateService(config(), docker).getStatus()).resolves.toMatchObject({
      running: true, phase: "checking-health", result: null,
    });
  });

  it.each([
    [{ enabled: false }, ServiceUnavailableException],
    [{ projectDir: "relative" }, BadRequestException],
    [{ services: ["backend", "frontend", "postgres"] }, BadRequestException],
    [{ composeFiles: [] }, BadRequestException],
  ])("rejects invalid runtime configuration %j", async (overrides, exception) => {
    await expect(new DeploymentUpdateService({ ...config(), ...overrides }, dockerClient()).startUpdate()).rejects.toBeInstanceOf(exception);
  });

  it("locks concurrent starts before runner pull finishes and unlocks after failure", async () => {
    const docker = dockerClient();
    let rejectPull!: (error: Error) => void;
    docker.pullImage.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectPull = reject; }));
    const service = new DeploymentUpdateService(config(), docker);
    const first = service.startUpdate();
    await expect(service.startUpdate()).rejects.toBeInstanceOf(ConflictException);
    await new Promise(setImmediate);
    await expect(service.getStatus()).resolves.toMatchObject({ running: true });
    rejectPull(new Error("pull failed"));
    await expect(first).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getStatus()).resolves.toMatchObject({ running: false, result: { status: "failed" } });
    await expect(service.startUpdate()).resolves.toMatchObject({ started: true });
  });

  it("does not remove an updater while it is running", async () => {
    const docker = dockerClient();
    docker.inspectContainer.mockResolvedValue({ State: { Running: true } });
    await expect(new DeploymentUpdateService(config(), docker).startUpdate()).rejects.toBeInstanceOf(ConflictException);
    expect(docker.removeContainer).not.toHaveBeenCalled();
  });

  it("retains the previous runner when runner pull fails", async () => {
    const docker = dockerClient();
    docker.inspectContainer.mockResolvedValue({ State: { Running: false } });
    docker.pullImage.mockRejectedValue(new Error("pull failed"));
    await expect(new DeploymentUpdateService(config(), docker).startUpdate()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(docker.removeContainer).not.toHaveBeenCalled();
  });

  it("runs digest-pinned application updates and keeps bounded logs after exit", async () => {
    const docker = dockerClient();
    docker.inspectContainer.mockResolvedValue({ State: { Running: false } });
    await new DeploymentUpdateService(config(), docker).startUpdate();
    const spec = docker.createContainer.mock.calls[0][1] as { Cmd: string[]; HostConfig: object; Labels: object };
    expect(docker.removeContainer).toHaveBeenCalledWith("factory-rental-updater");
    expect(spec.Cmd.slice(0, 6)).toEqual(["timeout", "-s", "TERM", "-k", "10", "900"]);
    expect(spec.Cmd.at(-1)).toContain(manifest.images.backend);
    expect(spec.Cmd.at(-1)).toContain("up -d --no-deps --no-build backend frontend");
    expect(spec.Cmd.at(-1)).not.toContain("remove-orphans");
    expect(spec.HostConfig).toMatchObject({ AutoRemove: false, LogConfig: { Config: { "max-size": "1m" } } });
    expect(spec.Labels).toMatchObject({ "factory-rental-system.revision": manifest.revision });
  });

  it.each([[0, "succeeded"], [1, "failed"], [42, "failed"], [143, "failed"]])("keeps exit code %i and redacts bounded logs after backend restart", async (exitCode, status) => {
    const docker = dockerClient();
    docker.inspectContainer.mockResolvedValue({
      State: { Running: false, ExitCode: exitCode, StartedAt: "2026-09-14T00:00:00Z", FinishedAt: "2026-09-14T00:01:00Z" },
      Config: { Labels: { "factory-rental-system.revision": manifest.revision, "factory-rental-system.version": manifest.version } },
    });
    docker.containerLogs.mockResolvedValue(`${"x".repeat(20_000)} DB_PASSWORD=private JWT_SECRET='two words' https://name:pass@example.com Authorization=Bearer abc {"password": "json-value"} Authorization: Basic encoded-auth`);
    const result = (await new DeploymentUpdateService(config(), docker).getStatus()).result!;
    expect(result).toMatchObject({ status, exitCode, revision: manifest.revision, version: manifest.version });
    expect(result.logs.length).toBeLessThanOrEqual(12_000);
    expect(result.logs).not.toMatch(/private|two words|name:pass|Bearer abc|json-value|encoded-auth/);
    if (exitCode === 42) expect(result.message).toContain("健康或版本校验超时");
  });

  it("reports a container that failed to start instead of a successful zero exit", async () => {
    const docker = dockerClient();
    docker.startContainer.mockRejectedValue(new Error("start failed"));
    const service = new DeploymentUpdateService(config(), docker);
    await expect(service.startUpdate()).rejects.toBeInstanceOf(ServiceUnavailableException);
    docker.inspectContainer.mockResolvedValue({ State: { Running: false, ExitCode: 0, StartedAt: "0001-01-01T00:00:00Z" } });
    await expect(service.getStatus()).resolves.toMatchObject({ result: { status: "failed", message: expect.stringContaining("未成功启动") } });
  });
});
