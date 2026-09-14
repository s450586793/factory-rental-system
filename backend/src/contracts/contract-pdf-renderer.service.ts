import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ChildProcess, fork } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ContractDocumentPayload } from "./contract-document";

export const CONTRACT_PDF_RENDER_TIMEOUT_MS = 60_000;
export const CONTRACT_PDF_RENDER_FAILURE = "合同 PDF 生成失败，请重试";
export const CONTRACT_PDF_RENDER_TIMEOUT = "合同 PDF 生成超时，请重试";

@Injectable()
export class ContractPdfRendererService implements OnModuleDestroy {
  private activeChild: ChildProcess | null = null;

  render(payload: ContractDocumentPayload): Promise<Buffer> {
    if (this.activeChild) {
      return Promise.reject(new Error(CONTRACT_PDF_RENDER_FAILURE));
    }
    const compiledWorker = join(__dirname, "contract-document-worker.js");
    const worker = existsSync(compiledWorker)
      ? compiledWorker
      : join(__dirname, "contract-document-worker.ts");
    return new Promise((resolveResult, reject) => {
      let pdf: Buffer | undefined;
      let failure: Error | undefined;
      const child = fork(worker, [], {
        execArgv: worker.endsWith(".ts")
          ? ["-r", require.resolve("ts-node/register/transpile-only")]
          : [],
        env: {
          ...process.env,
          TS_NODE_PROJECT: resolve(__dirname, "../../tsconfig.json"),
        },
        detached: process.platform !== "win32",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      this.activeChild = child;
      const timeout = setTimeout(() => {
        failure = new Error(CONTRACT_PDF_RENDER_TIMEOUT);
        this.terminate(child);
      }, CONTRACT_PDF_RENDER_TIMEOUT_MS);
      child.once("message", (message: { ok?: boolean; pdf?: string }) => {
        if (message.ok && typeof message.pdf === "string") {
          pdf = Buffer.from(message.pdf, "base64");
        } else {
          failure = new Error(CONTRACT_PDF_RENDER_FAILURE);
        }
      });
      child.once("error", () => {
        failure = new Error(CONTRACT_PDF_RENDER_FAILURE);
      });
      child.once("close", () => {
        clearTimeout(timeout);
        this.activeChild = null;
        if (failure || !pdf?.length) {
          reject(failure ?? new Error(CONTRACT_PDF_RENDER_FAILURE));
        } else {
          resolveResult(pdf);
        }
      });
      child.send(payload, (error) => {
        if (error) {
          failure = new Error(CONTRACT_PDF_RENDER_FAILURE);
          this.terminate(child);
        }
      });
    });
  }

  onModuleDestroy() {
    if (this.activeChild) {
      this.terminate(this.activeChild);
    }
  }

  private terminate(child: ChildProcess) {
    if (child.pid && process.platform !== "win32") {
      try {
        // 同时终止子进程中的 Python 渲染，避免超时后仍占用 CPU。
        process.kill(-child.pid, "SIGKILL");
        return;
      } catch {
        // 子进程可能已退出。
      }
    }
    child.kill("SIGKILL");
  }
}
