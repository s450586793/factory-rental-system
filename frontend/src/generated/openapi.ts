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
  category: "business-license" | "contract-attachment" | "receipt";
  storagePath: string;
};

export type Contract = {
  id: string;
  unitId: string;
  tenantName: string;
  contactName: string;
  tenantPhone: string;
  licenseCode: string;
  startDate: string;
  endDate: string;
  annualRent: number;
  paidAmount: number;
  outstandingAmount: number;
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
    tenantName: string;
    contactName: string;
    tenantPhone: string;
    licenseCode: string;
    startDate: string;
    endDate: string;
    annualRent: number;
    paidAmount: number;
    outstandingAmount: number;
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
