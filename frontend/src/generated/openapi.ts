/* eslint-disable */
/*
 * Initial contract snapshot for the current backend.
 * Refresh this file with `npm run generate:api` against a running backend.
 */

export type User = {
  id: string;
  username: string;
};

export type StoredFile = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category:
    "business-license" | "contract-attachment" | "payment-voucher" | "receipt";
  storagePath: string;
};

export type Contract = {
  id: string;
  unitId: string;
  lessorName: string;
  lessorLicenseCode: string;
  lessorContactName: string;
  lessorPhone: string;
  lessorSafetyManager: string;
  tenantName: string;
  contactName: string;
  tenantPhone: string;
  licenseCode: string;
  tenantSafetyManager: string;
  signedDate: string;
  startDate: string;
  endDate: string;
  annualRent: number;
  depositAmount: number;
  earlyTerminationPenaltyAmount: number;
  billingFrequency: "annual" | "semiannual";
  depositSettlementMode: "initial" | "carryover";
  depositCarryoverAmount: number;
  depositCarryoverSourceContractId: string | null;
  dueReceivableAmount: number;
  duePaidAmount: number;
  outstandingAmount: number;
  prepaidAmount: number;
  unallocatedAmount: number;
  status: "future" | "active" | "expired";
  businessLicenseFileId: string | null;
  businessLicenseFile: StoredFile | null;
  attachmentFiles: StoredFile[];
};

export type MeterConfig = {
  id: string;
  unitId: string;
  type: "electric" | "water";
  name: string;
  initialReading: number;
  multiplier: number;
  unitPrice: number;
  lineLossPercent: number;
  enabled: boolean;
};

export type UnitSummary = {
  id: string;
  code: string;
  location: string;
  area: number | null;
  status: "occupied" | "vacant" | "expiring" | "expired";
  activeContract: {
    id: string;
    lessorName: string;
    lessorLicenseCode: string;
    lessorContactName: string;
    lessorPhone: string;
    lessorSafetyManager: string;
    tenantName: string;
    contactName: string;
    tenantPhone: string;
    licenseCode: string;
    tenantSafetyManager: string;
    signedDate: string;
    startDate: string;
    endDate: string;
    annualRent: number;
    depositAmount: number;
    earlyTerminationPenaltyAmount: number;
    billingFrequency: "annual" | "semiannual";
    depositSettlementMode: "initial" | "carryover";
    depositCarryoverAmount: number;
    depositCarryoverSourceContractId: string | null;
    dueReceivableAmount: number;
    duePaidAmount: number;
    outstandingAmount: number;
    prepaidAmount: number;
    unallocatedAmount: number;
    status: "future" | "active" | "expired";
  } | null;
  contractCount: number;
  meterConfigs: MeterConfig[];
  contracts: Contract[];
};

export type UtilityPrefillMeter = {
  meterConfigId: string;
  name: string;
  multiplier: number;
  unitPrice: number;
  lineLossPercent: number;
  previousReading: number;
  previousReadAt: string;
};

export type UtilityChargeItem = {
  id: string;
  meterConfigId: string;
  meterNameSnapshot: string;
  multiplierSnapshot: number;
  unitPriceSnapshot: number;
  lineLossPercentSnapshot: number;
  previousReading: number;
  currentReading: number;
  usage: number;
  adjustedUsage: number;
  amount: number;
};

export type UtilityChargeRecord = {
  id: string;
  unitId: string;
  contractId: string;
  tenantNameSnapshot: string;
  tenantPhoneSnapshot: string;
  type: "electric" | "water";
  previousReadAt: string;
  currentReadAt: string;
  totalUsage: number;
  adjustedUsage: number;
  amount: number;
  status: "unpaid" | "paid";
  recordedAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  note: string | null;
  attachmentFiles: StoredFile[];
  unit: { id: string; code: string; location: string };
  contract: Contract;
  items: UtilityChargeItem[];
};

export type RentPayment = {
  id: string;
  unitId: string;
  contractId: string;
  tenantNameSnapshot: string;
  paymentDate: string;
  amount: number;
  method: string;
  note: string | null;
  unit: { id: string; code: string; location: string };
  contract: Contract;
  attachmentFiles: StoredFile[];
};

export type RentReceivable = {
  id: string;
  contractId: string;
  sequence: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  receivableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  prepaidAmount: number;
  status: "not-due" | "partially-prepaid" | "prepaid" | "overdue" | "settled";
};

export type RentPaymentAllocationPreview = {
  allocations: Array<{
    scheduleId: string;
    sequence: number;
    periodStart: string;
    periodEnd: string;
    allocatedAmount: number;
  }>;
  unallocatedAmount: number;
};

export type RentPaymentMutationResult = RentPaymentAllocationPreview & {
  payment: RentPayment;
};

export type DepositAccountSummary = {
  unitId: string;
  unit: { id: string; code: string; location: string };
  tenantName: string;
  agreedDepositAmount: number;
  heldAmount: number;
  supplementAmount: number;
  refundAmount: number;
  latestContractId: string | null;
  lastTransactionDate: string | null;
};

export type DepositRecord = {
  id: string;
  unitId: string;
  contractId: string;
  tenantNameSnapshot: string;
  type: "received" | "refunded";
  paymentDate: string;
  amount: number;
  method: string;
  note: string | null;
  unit: { id: string; code: string; location: string };
  contract: Contract;
  attachmentFiles: StoredFile[];
};

export type Receipt = {
  id: string;
  receiptNo: string;
  sourceType: "utility" | "rent-payment";
  sourceId: string;
  tenantNameSnapshot: string;
  unitCodeSnapshot: string;
  amountSnapshot: number;
  issueDate: string;
  summary: string;
  pdfFileId: string | null;
  pdfFile: StoredFile | null;
  status: "active" | "void";
  voidedAt: string | null;
};
