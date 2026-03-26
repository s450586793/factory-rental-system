import { Contract } from "../contracts/contract.entity";
import { DepositRecord } from "../deposits/deposit-record.entity";
import { StoredFile } from "../files/stored-file.entity";
import { Receipt } from "../receipts/receipt.entity";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { AdminUser } from "../users/admin-user.entity";
import { UtilityChargeItem } from "../utilities/utility-charge-item.entity";
import { UtilityChargeRecord } from "../utilities/utility-charge-record.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";

export const databaseEntities = [
  AdminUser,
  StoredFile,
  FactoryUnit,
  Contract,
  UtilityMeterConfig,
  UtilityChargeRecord,
  UtilityChargeItem,
  RentPayment,
  DepositRecord,
  Receipt,
];
