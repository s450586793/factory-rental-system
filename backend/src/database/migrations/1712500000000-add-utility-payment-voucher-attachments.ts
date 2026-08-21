import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUtilityPaymentVoucherAttachments1712500000000 implements MigrationInterface {
  name = "AddUtilityPaymentVoucherAttachments1712500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "utility_charge_record_attachment_files" (
        "utilityChargeRecordId" uuid NOT NULL,
        "fileId" uuid NOT NULL,
        CONSTRAINT "PK_utility_charge_record_attachment_files" PRIMARY KEY ("utilityChargeRecordId", "fileId"),
        CONSTRAINT "FK_utility_charge_record_attachment_files_record"
          FOREIGN KEY ("utilityChargeRecordId") REFERENCES "utility_charge_records"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_utility_charge_record_attachment_files_file"
          FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_utility_charge_record_attachment_files_recordId"
      ON "utility_charge_record_attachment_files" ("utilityChargeRecordId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_utility_charge_record_attachment_files_fileId"
      ON "utility_charge_record_attachment_files" ("fileId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "utility_charge_record_attachment_files"`);
  }
}
