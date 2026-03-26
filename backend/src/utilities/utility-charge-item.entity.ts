import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { UtilityChargeRecord } from "./utility-charge-record.entity";
import { UtilityMeterConfig } from "./utility-meter-config.entity";

@Entity("utility_charge_items")
export class UtilityChargeItem extends BaseEntityWithTimestamps {
  @Column({ type: "uuid" })
  recordId!: string;

  @ManyToOne(() => UtilityChargeRecord, (record) => record.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recordId" })
  record!: UtilityChargeRecord;

  @Column({ type: "uuid" })
  meterConfigId!: string;

  @ManyToOne(() => UtilityMeterConfig, { eager: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "meterConfigId" })
  meterConfig!: UtilityMeterConfig;

  @Column()
  meterNameSnapshot!: string;

  @Column({
    type: "numeric",
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  multiplierSnapshot!: number;

  @Column({
    type: "numeric",
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  unitPriceSnapshot!: number;

  @Column({
    type: "numeric",
    precision: 8,
    scale: 2,
    transformer: numericTransformer,
  })
  lineLossPercentSnapshot!: number;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  previousReading!: number;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  currentReading!: number;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  usage!: number;

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
}
