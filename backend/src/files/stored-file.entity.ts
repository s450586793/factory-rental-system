import { Column, Entity } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";

export enum StoredFileCategory {
  BUSINESS_LICENSE = "business-license",
  CONTRACT_ATTACHMENT = "contract-attachment",
  RECEIPT = "receipt",
}

@Entity("stored_files")
export class StoredFile extends BaseEntityWithTimestamps {
  @Column()
  originalName!: string;

  @Column()
  storageName!: string;

  @Column()
  storagePath!: string;

  @Column()
  mimeType!: string;

  @Column({ type: "bigint" })
  size!: number;

  @Column({
    type: "enum",
    enum: StoredFileCategory,
  })
  category!: StoredFileCategory;
}
