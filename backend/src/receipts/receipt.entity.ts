import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";
import { numericTransformer } from "../common/database/numeric.transformer";
import { StoredFile } from "../files/stored-file.entity";

export enum ReceiptSourceType {
  UTILITY = "utility",
  RENT_PAYMENT = "rent-payment",
}

export enum ReceiptStatus {
  ACTIVE = "active",
  VOID = "void",
}

@Entity("receipts")
export class Receipt extends BaseEntityWithTimestamps {
  @Column({ unique: true })
  receiptNo!: string;

  @Column({
    type: "enum",
    enum: ReceiptSourceType,
  })
  sourceType!: ReceiptSourceType;

  @Column()
  sourceId!: string;

  @Column()
  tenantNameSnapshot!: string;

  @Column()
  unitCodeSnapshot!: string;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amountSnapshot!: number;

  @Column({ type: "date" })
  issueDate!: string;

  @Column()
  summary!: string;

  @Column({ type: "text", nullable: true })
  pdfFileId!: string | null;

  @ManyToOne(() => StoredFile, { eager: true, nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "pdfFileId" })
  pdfFile!: StoredFile | null;

  @Column({
    type: "enum",
    enum: ReceiptStatus,
    default: ReceiptStatus.ACTIVE,
  })
  status!: ReceiptStatus;

  @Column({ type: "date", nullable: true })
  voidedAt!: string | null;
}
