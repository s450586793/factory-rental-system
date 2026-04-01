import type {
  Contract,
  DepositRecord,
  MeterConfig,
  Receipt,
  RentPayment,
  StoredFile,
  UnitSummary,
  User,
  UtilityChargeRecord,
  UtilityPrefillMeter,
} from "../types/models";
import { apiFetch } from "./client";

export const authApi = {
  login: (payload: { username: string; password: string }) =>
    apiFetch<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () => apiFetch<{ user: User }>("/auth/me"),
  logout: () =>
    apiFetch<{ success: boolean }>("/auth/logout", {
      method: "POST",
    }),
};

export const unitsApi = {
  list: () => apiFetch<UnitSummary[]>("/units"),
  detail: (id: string) => apiFetch<UnitSummary>(`/units/${id}`),
  create: (payload: { code: string; location: string; area: number | null }) =>
    apiFetch<UnitSummary>("/units", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: { code: string; location: string; area: number | null }) =>
    apiFetch<UnitSummary>(`/units/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/units/${id}`, {
      method: "DELETE",
    }),
};

export const contractsApi = {
  list: (unitId?: string) => apiFetch<Contract[]>(`/contracts${unitId ? `?unitId=${unitId}` : ""}`),
  create: (payload: Record<string, unknown>) =>
    apiFetch<Contract>("/contracts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Contract>(`/contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  generateDocument: (id: string) =>
    apiFetch<{ file: StoredFile; contract: Contract }>(`/contracts/${id}/generate-document`, {
      method: "POST",
    }),
  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/contracts/${id}`, {
      method: "DELETE",
    }),
};

export const utilitiesApi = {
  listMeterConfigs: (unitId?: string, type?: string) => {
    const search = new URLSearchParams();
    if (unitId) search.set("unitId", unitId);
    if (type) search.set("type", type);
    return apiFetch<MeterConfig[]>(`/utilities/meter-configs${search.toString() ? `?${search}` : ""}`);
  },
  createMeterConfig: (payload: Record<string, unknown>) =>
    apiFetch<MeterConfig>("/utilities/meter-configs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateMeterConfig: (id: string, payload: Record<string, unknown>) =>
    apiFetch<MeterConfig>(`/utilities/meter-configs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  removeMeterConfig: (id: string) =>
    apiFetch<{ success: boolean }>(`/utilities/meter-configs/${id}`, {
      method: "DELETE",
    }),
  prefill: (unitId: string, type: "electric" | "water") =>
    apiFetch<{ unitId: string; type: string; meters: UtilityPrefillMeter[] }>(
      `/utilities/prefill?unitId=${unitId}&type=${type}`,
    ),
  listRecords: () => apiFetch<UtilityChargeRecord[]>("/utilities/records"),
  createRecord: (payload: Record<string, unknown>) =>
    apiFetch<UtilityChargeRecord>("/utilities/records", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRecord: (id: string, payload: Record<string, unknown>) =>
    apiFetch<UtilityChargeRecord>(`/utilities/records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  payRecord: (id: string, payload: { paidAt?: string; paymentMethod?: string }) =>
    apiFetch<UtilityChargeRecord>(`/utilities/records/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeRecord: (id: string) =>
    apiFetch<{ success: boolean }>(`/utilities/records/${id}`, {
      method: "DELETE",
    }),
};

export const rentPaymentsApi = {
  list: () => apiFetch<RentPayment[]>("/rent-payments"),
  create: (payload: Record<string, unknown>) =>
    apiFetch<RentPayment>("/rent-payments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch<RentPayment>(`/rent-payments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/rent-payments/${id}`, {
      method: "DELETE",
    }),
};

export const depositsApi = {
  list: () => apiFetch<DepositRecord[]>("/deposits"),
  create: (payload: Record<string, unknown>) =>
    apiFetch<DepositRecord>("/deposits", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch<DepositRecord>(`/deposits/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/deposits/${id}`, {
      method: "DELETE",
    }),
};

export const receiptsApi = {
  list: () => apiFetch<Receipt[]>("/receipts"),
  create: (payload: { sourceType: "utility" | "rent-payment"; sourceId: string; issueDate?: string }) =>
    apiFetch<Receipt>("/receipts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  voidReceipt: (id: string) =>
    apiFetch<Receipt>(`/receipts/${id}`, {
      method: "DELETE",
    }),
};

export const filesApi = {
  async upload(files: File[], category: StoredFile["category"]) {
    const formData = new FormData();
    formData.append("category", category);
    files.forEach((file) => formData.append("files", file));
    return apiFetch<StoredFile[]>("/files/upload", {
      method: "POST",
      body: formData,
    });
  },
};
