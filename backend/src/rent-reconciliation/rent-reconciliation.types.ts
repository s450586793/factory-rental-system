import type { RentReconciliationStatus } from "./rent-reconciliation.dto";

export type ReconciliationFile = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
};

export type ReconciliationReceipt = {
  id: string;
  receiptNo: string;
  pdfFile: ReconciliationFile | null;
};

export type RentReconciliationPayment = {
  id: string;
  contractId: string;
  paymentDate: string;
  amount: number;
  method: string;
  note: string | null;
  attachmentFiles: ReconciliationFile[];
  activeReceipt: ReconciliationReceipt | null;
};

export type ContractPeriodReconciliation = {
  contractId: string;
  unit: {
    id: string;
    code: string;
    location: string;
  };
  startDate: string;
  endDate: string;
  receivableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  creditAmount: number;
  status: RentReconciliationStatus;
  payments: RentReconciliationPayment[];
};

export type TenantReconciliationSummary = {
  tenantName: string;
  contractCount: number;
  receivableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  creditAmount: number;
  lastPaymentDate: string | null;
  status: RentReconciliationStatus;
};

export type TenantReconciliationDetail = TenantReconciliationSummary & {
  periods: ContractPeriodReconciliation[];
};

export type RentReconciliationListResponse = {
  items: TenantReconciliationSummary[];
  availableYears: number[];
};
