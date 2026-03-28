import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUnitArea1711900000000 implements MigrationInterface {
  name = "AddUnitArea1711900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "factory_units"
      ADD COLUMN IF NOT EXISTS "area" numeric(12,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "factory_units"
      DROP COLUMN IF EXISTS "area"
    `);
  }
}
