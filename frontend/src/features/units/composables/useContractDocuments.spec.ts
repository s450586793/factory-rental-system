import { effectScope } from "vue";
import { flushPromises } from "@vue/test-utils";
import { contractsApi } from "../../../api";
import type { ContractDocumentStatus } from "../../../types/models";
import { useContractDocuments } from "./useContractDocuments";

vi.mock("../../../api", () => ({
  contractsApi: { documentStatus: vi.fn(), retryDocument: vi.fn() },
}));

function status(value: ContractDocumentStatus["status"]): ContractDocumentStatus {
  return {
    contractId: "contract-1", revision: "revision-1", status: value, attempts: 1,
    error: value === "failed" ? "生成超时" : null, updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

describe("contract document polling", () => {
  let scope = effectScope();
  const failure = vi.fn();
  let documents: ReturnType<typeof useContractDocuments>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    scope = effectScope();
    documents = scope.run(() => useContractDocuments(failure))!;
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });

  it("returns immediately for queued generation and downloads once when ready", async () => {
    vi.mocked(contractsApi.documentStatus)
      .mockResolvedValueOnce(status("pending"))
      .mockResolvedValueOnce(status("processing"))
      .mockResolvedValueOnce(status("ready"));
    const download = vi.fn();

    expect(await documents.downloadWhenReady("contract-1", download)).toBe(false);
    expect(download).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(documents.statuses.value["contract-1"].status).toBe("processing");
    expect(download).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(download).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(contractsApi.documentStatus).toHaveBeenCalledTimes(3);
  });

  it("downloads once when clicked again after a queued document becomes ready", async () => {
    vi.mocked(contractsApi.documentStatus)
      .mockResolvedValueOnce(status("pending"))
      .mockResolvedValueOnce(status("ready"));
    const queuedDownload = vi.fn();
    const latestDownload = vi.fn();

    expect(await documents.downloadWhenReady("contract-1", queuedDownload)).toBe(false);
    expect(await documents.downloadWhenReady("contract-1", latestDownload)).toBe(true);
    expect(queuedDownload).not.toHaveBeenCalled();
    expect(latestDownload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(queuedDownload).not.toHaveBeenCalled();
    expect(latestDownload).toHaveBeenCalledTimes(1);
  });

  it("reports generation failure and supports a new retry without duplicate requests", async () => {
    vi.mocked(contractsApi.documentStatus)
      .mockResolvedValueOnce(status("pending"))
      .mockResolvedValueOnce(status("failed"))
      .mockResolvedValue(status("ready"));
    const download = vi.fn();
    await documents.downloadWhenReady("contract-1", download);
    await vi.advanceTimersByTimeAsync(2000);
    expect(download).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith("生成超时");
    documents.track(["contract-1"]);
    await flushPromises();
    vi.mocked(contractsApi.retryDocument).mockResolvedValue(status("pending"));
    await Promise.all([documents.retry("contract-1"), documents.retry("contract-1")]);
    expect(contractsApi.retryDocument).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(documents.statuses.value["contract-1"].status).toBe("ready");
  });

  it("stops polling and suppresses downloads after the view is unmounted", async () => {
    vi.mocked(contractsApi.documentStatus).mockResolvedValue(status("processing"));
    const download = vi.fn();
    await documents.downloadWhenReady("contract-1", download);
    scope.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(contractsApi.documentStatus).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });

  it("discards a stale status request after retrying the contract", async () => {
    let resolveOld!: (result: ContractDocumentStatus) => void;
    vi.mocked(contractsApi.documentStatus).mockReturnValue(new Promise((resolve) => { resolveOld = resolve; }));
    documents.track(["contract-1"]);
    vi.mocked(contractsApi.retryDocument).mockResolvedValue(status("pending"));
    await documents.retry("contract-1");
    resolveOld(status("failed"));
    await flushPromises();
    expect(documents.statuses.value["contract-1"].status).toBe("pending");
  });

  it("surfaces status lookup and retry errors without a false download", async () => {
    vi.mocked(contractsApi.documentStatus).mockRejectedValue(new Error("状态暂不可用"));
    documents.track(["contract-1"]);
    await flushPromises();
    expect(documents.errors.value["contract-1"]).toBe("状态暂不可用");
    await expect(documents.downloadWhenReady("contract-1", vi.fn())).rejects.toThrow("状态暂不可用");
    vi.mocked(contractsApi.retryDocument).mockRejectedValue(new Error("重试暂不可用"));
    await documents.retry("contract-1");
    expect(failure).toHaveBeenCalledWith("重试暂不可用");
    expect(documents.retrying.value["contract-1"]).toBe(false);
  });
});
