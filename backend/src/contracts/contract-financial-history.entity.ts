import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Contract } from "./contract.entity";

@Entity("contract_financial_history")
@Index("IDX_contract_financial_history_contract_created", ["contractId", "createdAt"])
export class ContractFinancialHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "contractId" })
  contract!: Contract;

  @Column()
  field!: string;

  @Column({ type: "varchar", nullable: true })
  beforeValue!: string | null;

  @Column()
  afterValue!: string;

  @Column({ type: "uuid", nullable: true })
  actorId!: string | null;

  @Column({ type: "varchar", nullable: true })
  actorUsername!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
