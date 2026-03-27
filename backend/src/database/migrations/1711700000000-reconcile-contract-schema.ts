import { MigrationInterface, QueryRunner } from "typeorm";

export class ReconcileContractSchema1711700000000 implements MigrationInterface {
  name = "ReconcileContractSchema1711700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contracts_status_enum') THEN
          CREATE TYPE "contracts_status_enum" AS ENUM ('future', 'active', 'expired');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "tenantPhone" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "status" "contracts_status_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "businessLicenseFileId" uuid
    `);
    await queryRunner.query(`
      UPDATE "contracts"
      SET "status" = CASE
        WHEN "startDate" > CURRENT_DATE THEN 'future'::"contracts_status_enum"
        WHEN "endDate" < CURRENT_DATE THEN 'expired'::"contracts_status_enum"
        ELSE 'active'::"contracts_status_enum"
      END
      WHERE "status" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ALTER COLUMN "status" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contracts_unitId" ON "contracts" ("unitId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contract_attachment_files" (
        "contractId" uuid NOT NULL,
        "fileId" uuid NOT NULL,
        CONSTRAINT "PK_contract_attachment_files" PRIMARY KEY ("contractId", "fileId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contract_attachment_files_contractId"
      ON "contract_attachment_files" ("contractId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contract_attachment_files_fileId"
      ON "contract_attachment_files" ("fileId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_contract_attachment_files_fileId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_contract_attachment_files_contractId"
    `);
  }
}
