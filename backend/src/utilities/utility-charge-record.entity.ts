import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { Contract } from "../contracts/contract.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { UtilityChargeItem } from "./utility-charge-item.entity";
import { UtilityType } from "./utility-meter-config.entity";

export enum UtilityChargeStatus {
  UNPAID = "unpaid",
  PAID = "paid",
}

@Entity("utility_charge_records")
export class UtilityChargeRecord extends BaseEntityWithTimestamps {
  @Column()
  unitId!: string;

  @ManyToOne(() => FactoryUnit, { eager: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "unitId" })
  unit!: FactoryUnit;

  @Column()
  contractId!: string;

  @ManyToOne(() => Contract, (contract) => contract.utilityChargeRecords, {
    eager: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "contractId" })
  contract!: Contract;

  @Column()
  tenantNameSnapshot!: string;

  @Column({ default: "" })
  tenantPhoneSnapshot!: string;

  @Column({
    type: "enum",
    enum: UtilityType,
  })
  type!: UtilityType;

  @Column({ type: "date" })
  previousReadAt!: string;

  @Column({ type: "date" })
  currentReadAt!: string;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  totalUsage!: number;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  adjustedUsage!: number;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({
    type: "enum",
    enum: UtilityChargeStatus,
    default: UtilityChargeStatus.UNPAID,
  })
  status!: UtilityChargeStatus;

  @Column({ type: "date" })
  recordedAt!: string;

  @Column({ type: "date", nullable: true })
  paidAt!: string | null;

  @Column({ nullable: true })
  paymentMethod!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @OneToMany(() => UtilityChargeItem, (item) => item.record, {
    eager: true,
    cascade: true,
  })
  items!: UtilityChargeItem[];
}
