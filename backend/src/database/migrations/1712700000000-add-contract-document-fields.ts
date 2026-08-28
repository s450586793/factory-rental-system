import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContractDocumentFields1712700000000 implements MigrationInterface {
  name = "AddContractDocumentFields1712700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "signedDate" date
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "lessorSafetyManager" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "tenantSafetyManager" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "earlyTerminationPenaltyAmount" numeric(12,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "contracts"
      SET "signedDate" = "startDate"
      WHERE "signedDate" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "contracts"
      SET "lessorSafetyManager" = COALESCE(
        NULLIF("lessorSafetyManager", ''),
        NULLIF("lessorContactName", ''),
        NULLIF("lessorName", ''),
        '未指定'
      )
    `);
    await queryRunner.query(`
      UPDATE "contracts"
      SET "tenantSafetyManager" = COALESCE(
        NULLIF("tenantSafetyManager", ''),
        NULLIF("contactName", ''),
        NULLIF("tenantName", ''),
        '未指定'
      )
    `);
    await queryRunner.query(`
      UPDATE "contracts"
      SET "earlyTerminationPenaltyAmount" = ROUND("annualRent" / 12, 2)
      WHERE "earlyTerminationPenaltyAmount" = 0
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ALTER COLUMN "signedDate" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "earlyTerminationPenaltyAmount"
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "tenantSafetyManager"
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "lessorSafetyManager"
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "signedDate"
    `);
  }
}
