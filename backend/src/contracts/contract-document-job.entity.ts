import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";
import type { ContractDocumentPayload } from "./contract-document";
import { Contract } from "./contract.entity";

export type ContractDocumentStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

@Entity("contract_document_jobs")
@Index("IDX_contract_document_jobs_pending", ["updatedAt"], { where: '"status" = \'pending\'' })
export class ContractDocumentJob {
  @PrimaryColumn("uuid")
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: "CASCADE" })
  @JoinColumn({ name: "contractId" })
  contract!: Contract;

  @Column({ length: 64 })
  revision!: string;

  @Column({ type: "varchar", default: "pending" })
  status!: ContractDocumentStatus;

  @Column({ type: "jsonb" })
  payload!: ContractDocumentPayload;

  @Column()
  filename!: string;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ type: "text", nullable: true })
  error!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
