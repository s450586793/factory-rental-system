import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { FactoryUnit } from "../units/factory-unit.entity";

export enum UtilityType {
  ELECTRIC = "electric",
  WATER = "water",
}

@Entity("utility_meter_configs")
export class UtilityMeterConfig extends BaseEntityWithTimestamps {
  @Column()
  unitId!: string;

  @ManyToOne(() => FactoryUnit, (unit) => unit.meterConfigs, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "unitId" })
  unit!: FactoryUnit;

  @Column({
    type: "enum",
    enum: UtilityType,
  })
  type!: UtilityType;

  @Column()
  name!: string;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  initialReading!: number;

  @Column({
    type: "numeric",
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  multiplier!: number;

  @Column({
    type: "numeric",
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  unitPrice!: number;

  @Column({
    type: "numeric",
    precision: 8,
    scale: 2,
    transformer: numericTransformer,
  })
  lineLossPercent!: number;

  @Column({ default: true })
  enabled!: boolean;
}
