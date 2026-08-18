import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContractLessorFields1712400000000 implements MigrationInterface {
  name = "AddContractLessorFields1712400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "lessorName" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "lessorLicenseCode" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "lessorContactName" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "lessorPhone" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      UPDATE "contracts"
      SET "lessorName" = '吴孝斌',
          "lessorLicenseCode" = '',
          "lessorContactName" = '吴孝斌',
          "lessorPhone" = '18651510352'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "lessorPhone"`);
    await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "lessorContactName"`);
    await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "lessorLicenseCode"`);
    await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "lessorName"`);
  }
}
