import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { DepositRecord } from "../deposits/deposit-record.entity";
import { StoredFile } from "../files/stored-file.entity";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { UtilityChargeRecord } from "../utilities/utility-charge-record.entity";

export enum ContractStatus {
  FUTURE = "future",
  ACTIVE = "active",
  EXPIRED = "expired",
}

@Entity("contracts")
export class Contract extends BaseEntityWithTimestamps {
  @Column({ type: "uuid" })
  unitId!: string;

  @ManyToOne(() => FactoryUnit, (unit) => unit.contracts, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "unitId" })
  unit!: FactoryUnit;

  @Column()
  tenantName!: string;

  @Column({ default: "" })
  tenantPhone!: string;

  @Column({ type: "date" })
  startDate!: string;

  @Column({ type: "date" })
  endDate!: string;

  @Column({
    type: "numeric",
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  annualRent!: number;

  @Column({
    type: "enum",
    enum: ContractStatus,
  })
  status!: ContractStatus;

  @Column({ type: "uuid", nullable: true })
  businessLicenseFileId!: string | null;

  @ManyToOne(() => StoredFile, { nullable: true, onDelete: "SET NULL", eager: true })
  @JoinColumn({ name: "businessLicenseFileId" })
  businessLicenseFile!: StoredFile | null;

  @ManyToMany(() => StoredFile, { eager: true })
  @JoinTable({
    name: "contract_attachment_files",
    joinColumn: { name: "contractId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "fileId", referencedColumnName: "id" },
  })
  attachmentFiles!: StoredFile[];

  @OneToMany(() => UtilityChargeRecord, (utilityChargeRecord) => utilityChargeRecord.contract)
  utilityChargeRecords!: UtilityChargeRecord[];

  @OneToMany(() => RentPayment, (rentPayment) => rentPayment.contract)
  rentPayments!: RentPayment[];

  @OneToMany(() => DepositRecord, (depositRecord) => depositRecord.contract)
  deposits!: DepositRecord[];
}
