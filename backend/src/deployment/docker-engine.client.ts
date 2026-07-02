import { Injectable } from "@nestjs/common";
import { request } from "node:http";
import type { DeploymentUpdateConfig } from "../config/deployment-update.config";

type DockerRequestOptions = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
};

@Injectable()
export class DockerEngineHttpClient {
  constructor(private readonly config: DeploymentUpdateConfig) {}

  async pullImage(image: string) {
    await this.request({
      method: "POST",
      path: `/images/create?fromImage=${encodeURIComponent(image)}`,
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

  async inspectContainer(name: string) {
    try {
      return await this.request<{ State?: { Running?: boolean } }>({
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
          const chunks: Buffer[] = [];

          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            const statusCode = res.statusCode ?? 500;

            if (statusCode >= 400) {
              reject(new DockerEngineError(statusCode, raw));
              return;
            }

            if (!raw.trim()) {
              resolve(undefined as T);
              return;
            }

            const lines = raw
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            const lastLine = lines.at(-1);

            try {
              resolve(JSON.parse(lastLine ?? raw) as T);
            } catch {
              resolve(raw as T);
            }
          });
        },
      );

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
    readonly responseBody: string,
  ) {
    super(`Docker Engine API returned ${statusCode}`);
  }
}
