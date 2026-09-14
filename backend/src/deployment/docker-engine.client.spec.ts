import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDeploymentUpdateConfig } from "../config/deployment-update.config";
import { DockerEngineHttpClient } from "./docker-engine.client";

describe("DockerEngineHttpClient", () => {
  let directory: string;
  let server: Server;
  let client: DockerEngineHttpClient;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "docker-client-"));
    const socketPath = join(directory, "docker.sock");
    server = createServer();
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    client = new DockerEngineHttpClient({ ...resolveDeploymentUpdateConfig({}), dockerSocketPath: socketPath, dockerRequestTimeoutMs: 100 });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });

  it("rejects Docker pull error events even with HTTP 200 and later progress", async () => {
    server.on("request", (_req, res) => res.end('{"error":"private registry failure"}\n{"status":"done"}\n'));
    await expect(client.pullImage("image:test")).rejects.toThrow("Docker image pull failed");
  });

  it("accepts a successful streamed pull", async () => {
    server.on("request", (_req, res) => res.end('{"status":"pulling"}\n{"status":"done"}\n'));
    await expect(client.pullImage("image:test")).resolves.toBeUndefined();
  });

  it("bounds a stalled Docker request", async () => {
    server.on("request", () => undefined);
    await expect(client.pullImage("image:test")).rejects.toThrow("timed out");
  });

  it("returns null only for a missing container", async () => {
    server.on("request", (_req, res) => { res.writeHead(404); res.end("sensitive details"); });
    await expect(client.inspectContainer("updater")).resolves.toBeNull();
  });

  it("does not expose Docker error response content", async () => {
    server.on("request", (_req, res) => { res.writeHead(500); res.end("password=secret"); });
    await expect(client.startContainer("updater")).rejects.toThrow("Docker Engine API returned 500");
  });

  it("retains only the bounded tail of raw container logs", async () => {
    server.on("request", (_req, res) => res.end(`${"x".repeat(30_000)}final log line`));
    const logs = await client.containerLogs("updater");
    expect(logs.length).toBe(16_384);
    expect(logs.endsWith("final log line")).toBe(true);
  });
});
