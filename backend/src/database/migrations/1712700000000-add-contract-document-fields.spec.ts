import { QueryRunner } from "typeorm";
import { AddContractDocumentFields1712700000000 } from "./1712700000000-add-contract-document-fields";

describe("AddContractDocumentFields1712700000000", () => {
  it("adds and backfills the contract signing, safety manager and termination penalty fields", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddContractDocumentFields1712700000000().up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "signedDate" date');
    expect(sql).toContain('"signedDate" = "startDate"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "lessorSafetyManager"');
    expect(sql).toContain("NULLIF(\"lessorContactName\", '')");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "tenantSafetyManager"');
    expect(sql).toContain("NULLIF(\"contactName\", '')");
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "earlyTerminationPenaltyAmount" numeric(12,2)',
    );
    expect(sql).toContain('ROUND("annualRent" / 12, 2)');
    expect(sql).toContain('ALTER COLUMN "signedDate" SET NOT NULL');
  });

  it("removes only the contract document fields on rollback", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddContractDocumentFields1712700000000().down(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(sql).toContain(
      'DROP COLUMN IF EXISTS "earlyTerminationPenaltyAmount"',
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS "tenantSafetyManager"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "lessorSafetyManager"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "signedDate"');
    expect(sql).not.toContain("DROP TABLE");
  });
});
