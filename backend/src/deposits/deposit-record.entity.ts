import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { Contract } from "../contracts/contract.entity";
import { FactoryUnit } from "../units/factory-unit.entity";

export enum DepositRecordType {
  RECEIVED = "received",
  REFUNDED = "refunded",
}

@Entity("deposit_records")
export class DepositRecord extends BaseEntityWithTimestamps {
  @Column()
  unitId!: string;

  @ManyToOne(() => FactoryUnit, { eager: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "unitId" })
  unit!: FactoryUnit;

  @Column()
  contractId!: string;

  @ManyToOne(() => Contract, (contract) => contract.deposits, { eager: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "contractId" })
  contract!: Contract;

  @Column()
  tenantNameSnapshot!: string;

  @Column({
    type: "enum",
    enum: DepositRecordType,
  })
  type!: DepositRecordType;

  @Column({ type: "date" })
  paymentDate!: string;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column()
  method!: string;

  @Column({ type: "text", nullable: true })
  note!: string | null;
}
