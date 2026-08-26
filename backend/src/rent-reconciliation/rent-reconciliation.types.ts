export enum RentReconciliationStatus {
  OUTSTANDING = "outstanding",
  SETTLED = "settled",
  PREPAID = "prepaid",
  CREDIT = "credit",
}

export enum RentReconciliationPeriodStatus {
  NOT_DUE = "not-due",
  PARTIALLY_PREPAID = "partially-prepaid",
  PREPAID = "prepaid",
  OVERDUE = "overdue",
  SETTLED = "settled",
}

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
  scheduleId: string;
  contractId: string;
  sequence: number;
  unit: {
    id: string;
    code: string;
    location: string;
  };
  startDate: string;
  endDate: string;
  dueDate: string;
  receivableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  prepaidAmount: number;
  status: RentReconciliationPeriodStatus;
  payments: RentReconciliationPayment[];
};

export type TenantReconciliationSummary = {
  tenantName: string;
  contractCount: number;
  dueReceivableAmount: number;
  duePaidAmount: number;
  outstandingAmount: number;
  prepaidAmount: number;
  unallocatedAmount: number;
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
