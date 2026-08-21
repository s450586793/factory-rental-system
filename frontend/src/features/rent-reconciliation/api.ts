import { apiDownload, apiFetch } from "../../api/client";
import type {
  ReconciliationDetailQuery,
  ReconciliationListQuery,
  RentReconciliationListResponse,
  TenantReconciliationDetail,
} from "./types";

function buildQuery(query: ReconciliationListQuery | ReconciliationDetailQuery) {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const rentReconciliationApi = {
  list: (query: ReconciliationListQuery) =>
    apiFetch<RentReconciliationListResponse>(`/rent-reconciliation${buildQuery(query)}`),
  detail: (query: ReconciliationDetailQuery) =>
    apiFetch<TenantReconciliationDetail>(`/rent-reconciliation/detail${buildQuery(query)}`),
  downloadPdf: (query: ReconciliationDetailQuery) =>
    apiDownload(`/rent-reconciliation/pdf${buildQuery(query)}`),
};
