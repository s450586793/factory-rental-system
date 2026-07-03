import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContractDepositAmount1712200000000 implements MigrationInterface {
  name = "AddContractDepositAmount1712200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "depositAmount" numeric(12,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "contracts"
      SET "depositAmount" = ROUND(("annualRent" / 12 * 2)::numeric, 2)
      WHERE "depositAmount" = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "depositAmount"
    `);
  }
}
