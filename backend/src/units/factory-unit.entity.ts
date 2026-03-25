import { Column, Entity, OneToMany } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { Contract } from "../contracts/contract.entity";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";

@Entity("factory_units")
export class FactoryUnit extends BaseEntityWithTimestamps {
  @Column({ unique: true })
  code!: string;

  @Column()
  location!: string;

  @OneToMany(() => Contract, (contract) => contract.unit)
  contracts!: Contract[];

  @OneToMany(() => UtilityMeterConfig, (meterConfig) => meterConfig.unit)
  meterConfigs!: UtilityMeterConfig[];

  @OneToMany(() => RentPayment, (rentPayment) => rentPayment.unit)
  rentPayments!: RentPayment[];
}
