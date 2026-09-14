import { createHash } from "node:crypto";
import { Contract } from "./contract.entity";
import { FactoryUnit } from "../units/factory-unit.entity";

const CONTRACT_DOCUMENT_CACHE_VERSION = "2026-09-14-v6";

export function buildDocumentRevision(contract: Contract, unit: FactoryUnit) {
  const payload = {
    version: CONTRACT_DOCUMENT_CACHE_VERSION,
    contract: {
      lessorName: contract.lessorName,
      lessorLicenseCode: contract.lessorLicenseCode,
      lessorContactName: contract.lessorContactName,
      lessorPhone: contract.lessorPhone,
      lessorSafetyManager: contract.lessorSafetyManager,
      tenantName: contract.tenantName,
      contactName: contract.contactName,
      tenantPhone: contract.tenantPhone,
      licenseCode: contract.licenseCode,
      tenantSafetyManager: contract.tenantSafetyManager,
      signedDate: contract.signedDate,
      startDate: contract.startDate,
      endDate: contract.endDate,
      annualRent: Number(contract.annualRent).toFixed(2),
      depositAmount: Number(contract.depositAmount).toFixed(2),
      electricUnitPrice: Number(contract.electricUnitPrice).toFixed(4),
      electricLineLossPercent: Number(contract.electricLineLossPercent).toFixed(
        2,
      ),
      waterUnitPrice: Number(contract.waterUnitPrice).toFixed(4),
      earlyTerminationPenaltyAmount: Number(
        contract.earlyTerminationPenaltyAmount,
      ).toFixed(2),
      billingFrequency: contract.billingFrequency,
    },
    unit: { code: unit.code, location: unit.location, area: unit.area === null ? null : Number(unit.area) },
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
