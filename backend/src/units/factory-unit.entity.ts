import { Column, Entity, OneToMany, ValueTransformer } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { Contract } from "../contracts/contract.entity";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";

const nullableNumericTransformer: ValueTransformer = {
  to: (value?: number | null) => (value === undefined || value === null ? null : value),
  from: (value?: string | number | null) => (value === undefined || value === null ? null : Number(value)),
};

@Entity("factory_units")
export class FactoryUnit extends BaseEntityWithTimestamps {
  @Column({ unique: true })
  code!: string;

  @Column()
  location!: string;

  @Column({
    type: "numeric",
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: nullableNumericTransformer,
  })
  area!: number | null;

  @OneToMany(() => Contract, (contract) => contract.unit)
  contracts!: Contract[];

  @OneToMany(() => UtilityMeterConfig, (meterConfig) => meterConfig.unit)
  meterConfigs!: UtilityMeterConfig[];

  @OneToMany(() => RentPayment, (rentPayment) => rentPayment.unit)
  rentPayments!: RentPayment[];
}
