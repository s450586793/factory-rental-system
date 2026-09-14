import { EventEmitter } from "node:events";
import { fork } from "node:child_process";
import fs from "node:fs";
import {
  ContractPdfRendererService,
  CONTRACT_PDF_RENDER_TIMEOUT_MS,
} from "./contract-pdf-renderer.service";

jest.mock("node:child_process", () => ({ fork: jest.fn() }));

function childProcess() {
  const child = Object.assign(new EventEmitter(), {
    pid: 12345,
    send: jest.fn((_payload, callback) => callback(null)),
    kill: jest.fn(),
  });
  jest.mocked(fork).mockReturnValue(child as never);
  return child;
}

describe("ContractPdfRendererService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("forks the compiled worker and waits for process exit before releasing its slot", async () => {
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const child = childProcess();
    const renderer = new ContractPdfRendererService();
    const payload = { contract: { id: "contract-1" } } as never;
    const result = renderer.render(payload);
    expect(fork).toHaveBeenCalledWith(
      expect.stringMatching(/contract-document-worker\.js$/),
      [],
      expect.objectContaining({
        execArgv: [],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      }),
    );
    expect(child.send).toHaveBeenCalledWith(payload, expect.any(Function));
    child.emit("message", {
      ok: true,
      pdf: Buffer.from("%PDF").toString("base64"),
    });
    await expect(renderer.render(payload)).rejects.toThrow("合同 PDF 生成失败");
    child.emit("close", 0);
    await expect(result).resolves.toEqual(Buffer.from("%PDF"));
  });

  it("uses ts-node only for the source worker in development", async () => {
    jest.spyOn(fs, "existsSync").mockReturnValue(false);
    const child = childProcess();
    const renderer = new ContractPdfRendererService();
    const result = renderer.render({} as never);
    expect(fork).toHaveBeenCalledWith(
      expect.stringMatching(/contract-document-worker\.ts$/),
      [],
      expect.objectContaining({
        execArgv: ["-r", expect.stringContaining("ts-node")],
        env: expect.objectContaining({
          TS_NODE_PROJECT: expect.stringMatching(/backend\/tsconfig.json$/),
        }),
      }),
    );
    child.emit("message", { ok: false });
    child.emit("close", 1);
    await expect(result).rejects.toThrow("合同 PDF 生成失败");
  });

  it("kills the whole rendering process group on timeout and reports a safe error", async () => {
    jest.useFakeTimers();
    const child = childProcess();
    const kill = jest.spyOn(process, "kill").mockImplementation(() => {
      child.emit("close", null);
      return true;
    });
    const result = new ContractPdfRendererService().render({} as never);
    const assertion =
      expect(result).rejects.toThrow("合同 PDF 生成超时，请重试");
    await jest.advanceTimersByTimeAsync(CONTRACT_PDF_RENDER_TIMEOUT_MS);
    await assertion;
    expect(kill).toHaveBeenCalledWith(-child.pid, "SIGKILL");
  });

  it("rejects an exited worker without a result, hiding system errors", async () => {
    const child = childProcess();
    const result = new ContractPdfRendererService().render({} as never);
    child.emit("error", new Error("private filesystem path and token"));
    child.emit("close", 1);
    await expect(result).rejects.toThrow("合同 PDF 生成失败，请重试");
  });

  it("terminates active rendering when the application shuts down", async () => {
    const child = childProcess();
    jest.spyOn(process, "kill").mockImplementation(() => {
      child.emit("close", null);
      return true;
    });
    const renderer = new ContractPdfRendererService();
    const result = renderer.render({} as never);
    renderer.onModuleDestroy();
    await expect(result).rejects.toThrow("合同 PDF 生成失败");
  });
});
