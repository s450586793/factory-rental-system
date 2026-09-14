import { Injectable } from "@nestjs/common";
import { request } from "node:http";
import type { DeploymentUpdateConfig } from "../config/deployment-update.config";

type DockerRequestOptions = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  raw?: boolean;
  stream?: boolean;
};

export type DockerContainer = {
  Config?: { Labels?: Record<string, string> };
  State?: {
    Running?: boolean;
    Status?: string;
    ExitCode?: number;
    StartedAt?: string;
    FinishedAt?: string;
  };
};

@Injectable()
export class DockerEngineHttpClient {
  constructor(private readonly config: DeploymentUpdateConfig) {}

  async pullImage(image: string) {
    await this.request({
      method: "POST",
      path: `/images/create?fromImage=${encodeURIComponent(image)}`,
      stream: true,
    });
  }

  async createContainer(name: string, body: unknown) {
    const response = await this.request<{ Id: string }>({
      method: "POST",
      path: `/containers/create?name=${encodeURIComponent(name)}`,
      body,
    });
    return response.Id;
  }

  async startContainer(id: string) {
    await this.request({
      method: "POST",
      path: `/containers/${encodeURIComponent(id)}/start`,
    });
  }

  async removeContainer(name: string) {
    await this.request({
      method: "DELETE",
      path: `/containers/${encodeURIComponent(name)}?force=1`,
    });
  }

  async containerLogs(name: string) {
    return this.request<string>({
      method: "GET",
      path: `/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&tail=100`,
      raw: true,
    });
  }

  async inspectContainer(name: string) {
    try {
      return await this.request<DockerContainer>({
        method: "GET",
        path: `/containers/${encodeURIComponent(name)}/json`,
      });
    } catch (error) {
      if (error instanceof DockerEngineError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  private request<T = unknown>(options: DockerRequestOptions): Promise<T> {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);

    return new Promise((resolve, reject) => {
      const req = request(
        {
          socketPath: this.config.dockerSocketPath,
          method: options.method,
          path: options.path,
          headers: {
            ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
          },
        },
        (res) => {
          let raw = "";
          let streamError = false;
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            raw += chunk;
            if (options.stream) {
              const lines = raw.split("\n");
              raw = lines.pop() ?? "";
              for (const line of lines) {
                try {
                  const event = JSON.parse(line);
                  if (event.error || event.errorDetail) streamError = true;
                } catch { /* Docker 进度流的空行不影响最终状态。 */ }
              }
            }
            if (raw.length > 1_048_576) {
              if (options.raw) raw = raw.slice(-16_384);
              else req.destroy(new Error("Docker Engine response exceeds size limit"));
            }
          });
          res.on("error", reject);
          res.on("aborted", () => reject(new Error("Docker Engine response interrupted")));
          res.on("end", () => {
            const statusCode = res.statusCode ?? 500;

            if (statusCode >= 400) {
              reject(new DockerEngineError(statusCode));
              return;
            }

            if (options.raw) {
              resolve(raw.slice(-16_384) as T);
              return;
            }
            let parsed: { error?: unknown; errorDetail?: unknown } | undefined;
            try {
              parsed = raw.trim() ? JSON.parse(raw) : undefined;
            } catch {
              reject(new Error("Invalid Docker Engine response"));
              return;
            }
            if (streamError || parsed?.error || parsed?.errorDetail) {
              reject(new Error("Docker image pull failed"));
              return;
            }
            resolve(parsed as T);
          });
        },
      );

      const timeoutMs = options.stream ? this.config.dockerRequestTimeoutMs : Math.min(this.config.dockerRequestTimeoutMs, 10_000);
      const timer = setTimeout(() => req.destroy(new Error("Docker Engine request timed out")), timeoutMs);
      req.on("close", () => clearTimeout(timer));
      req.on("error", reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}

export class DockerEngineError extends Error {
  constructor(
    readonly statusCode: number,
  ) {
    super(`Docker Engine API returned ${statusCode}`);
  }
}
