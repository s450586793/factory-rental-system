import { onScopeDispose, ref } from "vue";
import { contractsApi } from "../../../api";
import type { ContractDocumentStatus } from "../../../types/models";

export function useContractDocuments(onFailure: (message: string) => void) {
  const statuses = ref<Record<string, ContractDocumentStatus>>({});
  const errors = ref<Record<string, string>>({});
  const retrying = ref<Record<string, boolean>>({});
  const pendingDownloads = new Map<string, () => void>();
  const requestSequences = new Map<string, number>();
  let visibleIds: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function nextRequest(id: string) {
    const sequence = (requestSequences.get(id) ?? 0) + 1;
    requestSequences.set(id, sequence);
    return sequence;
  }

  function acceptStatus(id: string, status: ContractDocumentStatus) {
    if (disposed) return;
    statuses.value[id] = status;
    delete errors.value[id];
    const download = pendingDownloads.get(id);
    if (download && status.status === "ready") {
      pendingDownloads.delete(id);
      download();
    } else if (download && status.status === "failed") {
      pendingDownloads.delete(id);
      onFailure(status.error || "合同生成失败，请重试");
    }
  }

  function schedulePoll() {
    clearTimeout(timer);
    if (disposed) return;
    const ids = [...new Set([...visibleIds, ...pendingDownloads.keys()])].filter((id) =>
      ["pending", "processing"].includes(statuses.value[id]?.status),
    );
    if (ids.length) timer = setTimeout(() => void refresh(ids), 2000);
  }

  async function refresh(ids: string[]) {
    await Promise.all(ids.map(async (id) => {
      const sequence = nextRequest(id);
      try {
        const status = await contractsApi.documentStatus(id);
        if (requestSequences.get(id) === sequence) acceptStatus(id, status);
      } catch (error) {
        if (!disposed && requestSequences.get(id) === sequence) {
          errors.value[id] = error instanceof Error ? error.message : "获取生成状态失败";
        }
      }
    }));
    schedulePoll();
  }

  function track(ids: string[]) {
    visibleIds = ids;
    clearTimeout(timer);
    if (ids.length) void refresh(ids);
    else schedulePoll();
  }

  async function downloadWhenReady(id: string, download: () => void) {
    const sequence = nextRequest(id);
    let status = await contractsApi.documentStatus(id);
    if (disposed) return false;
    if (requestSequences.get(id) !== sequence && statuses.value[id]) status = statuses.value[id];
    if (status.status === "failed") {
      pendingDownloads.delete(id);
      acceptStatus(id, status);
      schedulePoll();
      throw new Error(status.error || "合同生成失败，请重试");
    }
    pendingDownloads.set(id, download);
    acceptStatus(id, status);
    schedulePoll();
    return status.status === "ready";
  }

  async function retry(id: string) {
    if (retrying.value[id]) return;
    retrying.value[id] = true;
    const sequence = nextRequest(id);
    try {
      const status = await contractsApi.retryDocument(id);
      if (requestSequences.get(id) === sequence) acceptStatus(id, status);
      schedulePoll();
    } catch (error) {
      if (!disposed) onFailure(error instanceof Error ? error.message : "重试生成失败");
    } finally {
      retrying.value[id] = false;
    }
  }

  onScopeDispose(() => {
    disposed = true;
    clearTimeout(timer);
    pendingDownloads.clear();
  });

  return { statuses, errors, retrying, track, retry, refresh, downloadWhenReady };
}
