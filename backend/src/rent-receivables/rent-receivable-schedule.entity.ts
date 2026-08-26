import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { Contract } from "../contracts/contract.entity";
import { RentPaymentAllocation } from "./rent-payment-allocation.entity";

@Entity("rent_receivable_schedules")
@Index(
  "UQ_rent_receivable_schedules_contract_sequence",
  ["contractId", "sequence"],
  {
    unique: true,
  },
)
export class RentReceivableSchedule extends BaseEntityWithTimestamps {
  @Column({ type: "uuid" })
  contractId!: string;

  @ManyToOne(() => Contract, (contract) => contract.rentReceivableSchedules, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "contractId" })
  contract!: Contract;

  @Column({ type: "integer" })
  sequence!: number;

  @Column({ type: "date" })
  periodStart!: string;

  @Column({ type: "date" })
  periodEnd!: string;

  @Column({ type: "date" })
  dueDate!: string;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  receivableAmount!: number;

  @OneToMany(() => RentPaymentAllocation, (allocation) => allocation.schedule)
  allocations!: RentPaymentAllocation[];
}
