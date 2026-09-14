import { MigrationInterface, QueryRunner } from "typeorm";

export class ContractDocumentJobsAndHistory1712900000000 implements MigrationInterface {
  name = "ContractDocumentJobsAndHistory1712900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "contract_document_jobs" (
        "contractId" uuid PRIMARY KEY REFERENCES "contracts"("id") ON DELETE CASCADE,
        "revision" varchar(64) NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending'
          CHECK ("status" IN ('pending', 'processing', 'ready', 'failed')),
        "payload" jsonb NOT NULL,
        "filename" varchar NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "error" text,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_contract_document_jobs_pending"
      ON "contract_document_jobs" ("updatedAt") WHERE "status" = 'pending'
    `);
    await queryRunner.query(`
      CREATE TABLE "contract_financial_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "contractId" uuid NOT NULL REFERENCES "contracts"("id") ON DELETE RESTRICT,
        "field" varchar NOT NULL,
        "beforeValue" varchar,
        "afterValue" varchar NOT NULL,
        "actorId" uuid,
        "actorUsername" varchar,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_contract_financial_history_contract_created"
      ON "contract_financial_history" ("contractId", "createdAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "contract_financial_history"');
    await queryRunner.query('DROP TABLE "contract_document_jobs"');
  }
}
