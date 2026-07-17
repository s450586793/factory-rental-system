import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentVoucherAttachments1712300000000 implements MigrationInterface {
  name = "AddPaymentVoucherAttachments1712300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "stored_files_category_enum"
      ADD VALUE IF NOT EXISTS 'payment-voucher'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rent_payment_attachment_files" (
        "rentPaymentId" uuid NOT NULL,
        "fileId" uuid NOT NULL,
        CONSTRAINT "PK_rent_payment_attachment_files" PRIMARY KEY ("rentPaymentId", "fileId"),
        CONSTRAINT "FK_rent_payment_attachment_files_payment"
          FOREIGN KEY ("rentPaymentId") REFERENCES "rent_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rent_payment_attachment_files_file"
          FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_payment_attachment_files_paymentId"
      ON "rent_payment_attachment_files" ("rentPaymentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_payment_attachment_files_fileId"
      ON "rent_payment_attachment_files" ("fileId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deposit_record_attachment_files" (
        "depositRecordId" uuid NOT NULL,
        "fileId" uuid NOT NULL,
        CONSTRAINT "PK_deposit_record_attachment_files" PRIMARY KEY ("depositRecordId", "fileId"),
        CONSTRAINT "FK_deposit_record_attachment_files_deposit"
          FOREIGN KEY ("depositRecordId") REFERENCES "deposit_records"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deposit_record_attachment_files_file"
          FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_deposit_record_attachment_files_depositId"
      ON "deposit_record_attachment_files" ("depositRecordId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_deposit_record_attachment_files_fileId"
      ON "deposit_record_attachment_files" ("fileId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_record_attachment_files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rent_payment_attachment_files"`);
  }
}
