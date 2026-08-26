import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRentReceivableSchedules1712600000000 implements MigrationInterface {
  name = "AddRentReceivableSchedules1712600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "contracts"
          WHERE "deletedAt" IS NULL
            AND "annualRent" <= 0
        ) THEN
          RAISE EXCEPTION '存在年租金小于或等于 0 的有效合同，请先人工修正年租金后再执行迁移';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contracts_billingfrequency_enum') THEN
          CREATE TYPE "contracts_billingfrequency_enum" AS ENUM ('annual', 'semiannual');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contracts_depositsettlementmode_enum') THEN
          CREATE TYPE "contracts_depositsettlementmode_enum" AS ENUM ('initial', 'carryover');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "contracts"
      ADD COLUMN IF NOT EXISTS "billingFrequency" "contracts_billingfrequency_enum" NOT NULL DEFAULT 'annual',
      ADD COLUMN IF NOT EXISTS "depositSettlementMode" "contracts_depositsettlementmode_enum" NOT NULL DEFAULT 'initial',
      ADD COLUMN IF NOT EXISTS "depositCarryoverAmount" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "depositCarryoverSourceContractId" uuid
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_contracts_deposit_carryover_amount_nonnegative'
        ) THEN
          ALTER TABLE "contracts"
          ADD CONSTRAINT "CHK_contracts_deposit_carryover_amount_nonnegative"
          CHECK ("depositCarryoverAmount" >= 0);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_contracts_deposit_carryover_source'
        ) THEN
          ALTER TABLE "contracts"
          ADD CONSTRAINT "FK_contracts_deposit_carryover_source"
          FOREIGN KEY ("depositCarryoverSourceContractId") REFERENCES "contracts"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contracts_depositCarryoverSourceContractId"
      ON "contracts" ("depositCarryoverSourceContractId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rent_receivable_schedules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "contractId" uuid NOT NULL,
        "sequence" integer NOT NULL,
        "periodStart" date NOT NULL,
        "periodEnd" date NOT NULL,
        "dueDate" date NOT NULL,
        "receivableAmount" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_rent_receivable_schedules_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rent_receivable_schedules_contract_sequence" UNIQUE ("contractId", "sequence"),
        CONSTRAINT "FK_rent_receivable_schedules_contract"
          FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_receivable_schedules_contractId"
      ON "rent_receivable_schedules" ("contractId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rent_payment_allocations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "rentPaymentId" uuid NOT NULL,
        "rentReceivableScheduleId" uuid NOT NULL,
        "allocatedAmount" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_rent_payment_allocations_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rent_payment_allocations_payment_schedule"
          UNIQUE ("rentPaymentId", "rentReceivableScheduleId"),
        CONSTRAINT "FK_rent_payment_allocations_payment"
          FOREIGN KEY ("rentPaymentId") REFERENCES "rent_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rent_payment_allocations_schedule"
          FOREIGN KEY ("rentReceivableScheduleId") REFERENCES "rent_receivable_schedules"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_payment_allocations_rentPaymentId"
      ON "rent_payment_allocations" ("rentPaymentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_payment_allocations_scheduleId"
      ON "rent_payment_allocations" ("rentReceivableScheduleId")
    `);

    await queryRunner.query(`
      INSERT INTO "rent_receivable_schedules"
        ("contractId", "sequence", "periodStart", "periodEnd", "dueDate", "receivableAmount")
      SELECT c.id, series.index + 1,
        (c."startDate" + make_interval(years => series.index))::date,
        LEAST(c."endDate", (c."startDate" + make_interval(years => series.index + 1) - interval '1 day')::date),
        (c."startDate" + make_interval(years => series.index))::date,
        c."annualRent"
      FROM contracts c
      CROSS JOIN LATERAL generate_series(
        0,
        GREATEST(0, EXTRACT(YEAR FROM age(c."endDate", c."startDate"))::integer + 1)
      ) AS series(index)
      WHERE c."deletedAt" IS NULL
        AND (c."startDate" + make_interval(years => series.index))::date <= c."endDate"
      ON CONFLICT ("contractId", "sequence") DO NOTHING
    `);

    await queryRunner.query(`
      WITH ordered_schedules AS (
        SELECT id, "contractId",
          COALESCE(SUM(ROUND("receivableAmount" * 100)::bigint) OVER (
            PARTITION BY "contractId" ORDER BY "dueDate", sequence
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS schedule_start_cents,
          SUM(ROUND("receivableAmount" * 100)::bigint) OVER (
            PARTITION BY "contractId" ORDER BY "dueDate", sequence
          ) AS schedule_end_cents
        FROM rent_receivable_schedules
        WHERE "deletedAt" IS NULL
      ), ordered_payments AS (
        SELECT id, "contractId",
          COALESCE(SUM(ROUND(amount * 100)::bigint) OVER (
            PARTITION BY "contractId" ORDER BY "paymentDate", id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS payment_start_cents,
          SUM(ROUND(amount * 100)::bigint) OVER (
            PARTITION BY "contractId" ORDER BY "paymentDate", id
          ) AS payment_end_cents
        FROM rent_payments
        WHERE "deletedAt" IS NULL
      )
      INSERT INTO rent_payment_allocations
        ("rentPaymentId", "rentReceivableScheduleId", "allocatedAmount")
      SELECT p.id, s.id,
        (LEAST(payment_end_cents, schedule_end_cents) -
          GREATEST(payment_start_cents, schedule_start_cents)) / 100.0
      FROM ordered_payments p
      JOIN ordered_schedules s ON s."contractId" = p."contractId"
      WHERE LEAST(payment_end_cents, schedule_end_cents) >
        GREATEST(payment_start_cents, schedule_start_cents)
      ON CONFLICT ("rentPaymentId", "rentReceivableScheduleId") DO NOTHING
    `);

    await queryRunner.query(`
      WITH carryover_candidates AS (
        SELECT current_contract.id,
          source_contract.id AS source_contract_id,
          COALESCE(balance.held_amount, 0) AS held_amount
        FROM contracts current_contract
        LEFT JOIN LATERAL (
          SELECT prior_contract.id
          FROM contracts prior_contract
          WHERE prior_contract."deletedAt" IS NULL
            AND prior_contract."unitId" = current_contract."unitId"
            AND btrim(prior_contract."tenantName") = btrim(current_contract."tenantName")
            AND prior_contract."startDate" < current_contract."startDate"
          ORDER BY prior_contract."startDate" DESC, prior_contract.id DESC
          LIMIT 1
        ) source_contract ON true
        LEFT JOIN LATERAL (
          SELECT SUM(
            CASE WHEN deposit.type = 'received' THEN deposit.amount ELSE -deposit.amount END
          ) AS held_amount
          FROM deposit_records deposit
          JOIN contracts deposit_contract ON deposit_contract.id = deposit."contractId"
          WHERE deposit."deletedAt" IS NULL
            AND deposit_contract."deletedAt" IS NULL
            AND deposit_contract."unitId" = current_contract."unitId"
            AND btrim(deposit."tenantNameSnapshot") = btrim(current_contract."tenantName")
            AND deposit_contract."startDate" < current_contract."startDate"
            AND deposit."paymentDate" <= current_contract."startDate"
        ) balance ON true
        WHERE current_contract."deletedAt" IS NULL
          AND btrim(current_contract."tenantName") <> ''
      )
      UPDATE contracts contract
      SET "depositSettlementMode" = 'carryover',
          "depositCarryoverAmount" = ROUND(candidate.held_amount, 2),
          "depositCarryoverSourceContractId" = candidate.source_contract_id
      FROM carryover_candidates candidate
      WHERE contract.id = candidate.id
        AND candidate.source_contract_id IS NOT NULL
        AND candidate.held_amount > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rent_payment_allocations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rent_receivable_schedules"`);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_contracts_depositCarryoverSourceContractId"
    `);
    await queryRunner.query(`
      ALTER TABLE "contracts"
      DROP CONSTRAINT IF EXISTS "FK_contracts_deposit_carryover_source",
      DROP CONSTRAINT IF EXISTS "CHK_contracts_deposit_carryover_amount_nonnegative",
      DROP COLUMN IF EXISTS "depositCarryoverSourceContractId",
      DROP COLUMN IF EXISTS "depositCarryoverAmount",
      DROP COLUMN IF EXISTS "depositSettlementMode",
      DROP COLUMN IF EXISTS "billingFrequency"
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contracts_depositsettlementmode_enum') THEN
          DROP TYPE "contracts_depositsettlementmode_enum";
        END IF;
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contracts_billingfrequency_enum') THEN
          DROP TYPE "contracts_billingfrequency_enum";
        END IF;
      END $$;
    `);
  }
}
