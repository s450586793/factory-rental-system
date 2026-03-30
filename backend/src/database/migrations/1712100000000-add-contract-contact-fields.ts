import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContractContactFields1712100000000 implements MigrationInterface {
  name = "AddContractContactFields1712100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "contactName" character varying NOT NULL DEFAULT ''
    `);

    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "licenseCode" character varying NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "licenseCode"
    `);

    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "contactName"
    `);
  }
}
