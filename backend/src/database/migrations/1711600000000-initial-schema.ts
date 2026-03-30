import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1711600000000 implements MigrationInterface {
  name = "InitialSchema1711600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await this.createEnum(queryRunner, "stored_files_category_enum", [
      "business-license",
      "contract-attachment",
      "receipt",
    ]);
    await this.createEnum(queryRunner, "contracts_status_enum", ["future", "active", "expired"]);
    await this.createEnum(queryRunner, "utility_meter_configs_type_enum", ["electric", "water"]);
    await this.createEnum(queryRunner, "utility_charge_records_type_enum", ["electric", "water"]);
    await this.createEnum(queryRunner, "utility_charge_records_status_enum", ["unpaid", "paid"]);
    await this.createEnum(queryRunner, "deposit_records_type_enum", ["received", "refunded"]);
    await this.createEnum(queryRunner, "receipts_sourcetype_enum", ["utility", "rent-payment"]);
    await this.createEnum(queryRunner, "receipts_status_enum", ["active", "void"]);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "username" character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        CONSTRAINT "PK_admin_users_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_admin_users_username" ON "admin_users" ("username")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stored_files" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "originalName" character varying NOT NULL,
        "storageName" character varying NOT NULL,
        "storagePath" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "size" bigint NOT NULL,
        "category" "stored_files_category_enum" NOT NULL,
        CONSTRAINT "PK_stored_files_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "factory_units" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "code" character varying NOT NULL,
        "location" character varying NOT NULL,
        "area" numeric(12,2),
        CONSTRAINT "PK_factory_units_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_factory_units_code" ON "factory_units" ("code")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contracts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "unitId" uuid NOT NULL,
        "tenantName" character varying NOT NULL,
        "contactName" character varying NOT NULL DEFAULT '',
        "tenantPhone" character varying NOT NULL DEFAULT '',
        "licenseCode" character varying NOT NULL DEFAULT '',
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "annualRent" numeric(12,2) NOT NULL,
        "status" "contracts_status_enum" NOT NULL,
        "businessLicenseFileId" uuid,
        CONSTRAINT "PK_contracts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contracts_unit" FOREIGN KEY ("unitId") REFERENCES "factory_units"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contracts_business_license" FOREIGN KEY ("businessLicenseFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contracts_unitId" ON "contracts" ("unitId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contract_attachment_files" (
        "contractId" uuid NOT NULL,
        "fileId" uuid NOT NULL,
        CONSTRAINT "PK_contract_attachment_files" PRIMARY KEY ("contractId", "fileId"),
        CONSTRAINT "FK_contract_attachment_contract" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_contract_attachment_file" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "utility_meter_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "unitId" uuid NOT NULL,
        "type" "utility_meter_configs_type_enum" NOT NULL,
        "name" character varying NOT NULL,
        "initialReading" numeric(14,2) NOT NULL,
        "multiplier" numeric(12,4) NOT NULL,
        "unitPrice" numeric(12,4) NOT NULL,
        "lineLossPercent" numeric(8,2) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_utility_meter_configs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_utility_meter_configs_unit" FOREIGN KEY ("unitId") REFERENCES "factory_units"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_utility_meter_configs_unitId" ON "utility_meter_configs" ("unitId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "utility_charge_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "unitId" uuid NOT NULL,
        "contractId" uuid NOT NULL,
        "tenantNameSnapshot" character varying NOT NULL,
        "tenantPhoneSnapshot" character varying NOT NULL DEFAULT '',
        "type" "utility_charge_records_type_enum" NOT NULL,
        "previousReadAt" date NOT NULL,
        "currentReadAt" date NOT NULL,
        "totalUsage" numeric(14,2) NOT NULL,
        "adjustedUsage" numeric(14,2) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "status" "utility_charge_records_status_enum" NOT NULL DEFAULT 'unpaid',
        "recordedAt" date NOT NULL,
        "paidAt" date,
        "paymentMethod" text,
        "note" text,
        CONSTRAINT "PK_utility_charge_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_utility_charge_records_unit" FOREIGN KEY ("unitId") REFERENCES "factory_units"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_utility_charge_records_contract" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_utility_charge_records_unitId" ON "utility_charge_records" ("unitId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_utility_charge_records_contractId" ON "utility_charge_records" ("contractId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "utility_charge_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "recordId" uuid NOT NULL,
        "meterConfigId" uuid NOT NULL,
        "meterNameSnapshot" character varying NOT NULL,
        "multiplierSnapshot" numeric(12,4) NOT NULL,
        "unitPriceSnapshot" numeric(12,4) NOT NULL,
        "lineLossPercentSnapshot" numeric(8,2) NOT NULL,
        "previousReading" numeric(14,2) NOT NULL,
        "currentReading" numeric(14,2) NOT NULL,
        "usage" numeric(14,2) NOT NULL,
        "adjustedUsage" numeric(14,2) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_utility_charge_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_utility_charge_items_record" FOREIGN KEY ("recordId") REFERENCES "utility_charge_records"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_utility_charge_items_meter" FOREIGN KEY ("meterConfigId") REFERENCES "utility_meter_configs"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_utility_charge_items_recordId" ON "utility_charge_items" ("recordId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rent_payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "unitId" uuid NOT NULL,
        "contractId" uuid NOT NULL,
        "tenantNameSnapshot" character varying NOT NULL,
        "paymentDate" date NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "method" character varying NOT NULL,
        "note" text,
        CONSTRAINT "PK_rent_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rent_payments_unit" FOREIGN KEY ("unitId") REFERENCES "factory_units"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_rent_payments_contract" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deposit_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "unitId" uuid NOT NULL,
        "contractId" uuid NOT NULL,
        "tenantNameSnapshot" character varying NOT NULL,
        "type" "deposit_records_type_enum" NOT NULL,
        "paymentDate" date NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "method" character varying NOT NULL,
        "note" text,
        CONSTRAINT "PK_deposit_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deposit_records_unit" FOREIGN KEY ("unitId") REFERENCES "factory_units"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposit_records_contract" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "receipts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "receiptNo" character varying NOT NULL,
        "sourceType" "receipts_sourcetype_enum" NOT NULL,
        "sourceId" uuid NOT NULL,
        "tenantNameSnapshot" character varying NOT NULL,
        "unitCodeSnapshot" character varying NOT NULL,
        "amountSnapshot" numeric(14,2) NOT NULL,
        "issueDate" date NOT NULL,
        "summary" character varying NOT NULL,
        "pdfFileId" uuid,
        "status" "receipts_status_enum" NOT NULL DEFAULT 'active',
        "voidedAt" date,
        CONSTRAINT "PK_receipts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_receipts_pdf_file" FOREIGN KEY ("pdfFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_receipts_receiptNo" ON "receipts" ("receiptNo")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "receipts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rent_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "utility_charge_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "utility_charge_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "utility_meter_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contract_attachment_files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contracts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "factory_units"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stored_files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"`);
    await this.dropEnum(queryRunner, "receipts_status_enum");
    await this.dropEnum(queryRunner, "receipts_sourcetype_enum");
    await this.dropEnum(queryRunner, "deposit_records_type_enum");
    await this.dropEnum(queryRunner, "utility_charge_records_status_enum");
    await this.dropEnum(queryRunner, "utility_charge_records_type_enum");
    await this.dropEnum(queryRunner, "utility_meter_configs_type_enum");
    await this.dropEnum(queryRunner, "contracts_status_enum");
    await this.dropEnum(queryRunner, "stored_files_category_enum");
  }

  private async createEnum(queryRunner: QueryRunner, name: string, values: string[]) {
    const serializedValues = values.map((value) => `'${value}'`).join(", ");
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
          CREATE TYPE "${name}" AS ENUM (${serializedValues});
        END IF;
      END $$;
    `);
  }

  private async dropEnum(queryRunner: QueryRunner, name: string) {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
          DROP TYPE "${name}";
        END IF;
      END $$;
    `);
  }
}
