export interface ContractFormFields {
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
  electricUnitPrice: number;
  electricLineLossPercent: number;
  waterUnitPrice: number;
  earlyTerminationPenaltyAmount: number;
  billingFrequency: "annual" | "semiannual";
}
