import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { RentReceivableSchedule } from "./rent-receivable-schedule.entity";

@Entity("rent_payment_allocations")
@Index(
  "UQ_rent_payment_allocations_payment_schedule",
  ["rentPaymentId", "rentReceivableScheduleId"],
  { unique: true },
)
export class RentPaymentAllocation extends BaseEntityWithTimestamps {
  @Column({ type: "uuid" })
  rentPaymentId!: string;

  @ManyToOne(() => RentPayment, (payment) => payment.allocations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "rentPaymentId" })
  payment!: RentPayment;

  @Column({ type: "uuid" })
  rentReceivableScheduleId!: string;

  @ManyToOne(() => RentReceivableSchedule, (schedule) => schedule.allocations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "rentReceivableScheduleId" })
  schedule!: RentReceivableSchedule;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  allocatedAmount!: number;
}
