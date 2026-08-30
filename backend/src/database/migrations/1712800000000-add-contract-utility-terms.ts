import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContractUtilityTerms1712800000000 implements MigrationInterface {
  name = "AddContractUtilityTerms1712800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "electricUnitPrice" numeric(12,4)
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "electricLineLossPercent" numeric(8,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "waterUnitPrice" numeric(12,4)
    `);
    await queryRunner.query(`
      UPDATE "contracts" AS contract
      SET "electricUnitPrice" = COALESCE((
            SELECT meter."unitPrice"
            FROM "utility_meter_configs" AS meter
            WHERE meter."unitId" = contract."unitId"
              AND meter.type = 'electric'
              AND meter.enabled = true
              AND meter."deletedAt" IS NULL
            ORDER BY meter.name, meter.id
            LIMIT 1
          ), 0),
          "electricLineLossPercent" = COALESCE((
            SELECT meter."lineLossPercent"
            FROM "utility_meter_configs" AS meter
            WHERE meter."unitId" = contract."unitId"
              AND meter.type = 'electric'
              AND meter.enabled = true
              AND meter."deletedAt" IS NULL
            ORDER BY meter.name, meter.id
            LIMIT 1
          ), 0),
          "waterUnitPrice" = COALESCE((
            SELECT meter."unitPrice"
            FROM "utility_meter_configs" AS meter
            WHERE meter."unitId" = contract."unitId"
              AND meter.type = 'water'
              AND meter.enabled = true
              AND meter."deletedAt" IS NULL
            ORDER BY meter.name, meter.id
            LIMIT 1
          ), 0)
      WHERE "electricUnitPrice" IS NULL
         OR "electricLineLossPercent" IS NULL
         OR "waterUnitPrice" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      ALTER COLUMN "electricUnitPrice" SET DEFAULT 0,
      ALTER COLUMN "electricUnitPrice" SET NOT NULL,
      ALTER COLUMN "electricLineLossPercent" SET DEFAULT 0,
      ALTER COLUMN "electricLineLossPercent" SET NOT NULL,
      ALTER COLUMN "waterUnitPrice" SET DEFAULT 0,
      ALTER COLUMN "waterUnitPrice" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP COLUMN IF EXISTS "waterUnitPrice",
      DROP COLUMN IF EXISTS "electricLineLossPercent",
      DROP COLUMN IF EXISTS "electricUnitPrice"
    `);
  }
}
