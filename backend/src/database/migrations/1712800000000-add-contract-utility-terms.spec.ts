import { QueryRunner } from "typeorm";
import { AddContractUtilityTerms1712800000000 } from "./1712800000000-add-contract-utility-terms";

describe("AddContractUtilityTerms1712800000000", () => {
  it("adds and backfills contract utility terms from each unit's enabled meters", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddContractUtilityTerms1712800000000().up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "electricUnitPrice" numeric(12,4)');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "electricLineLossPercent" numeric(8,2)');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "waterUnitPrice" numeric(12,4)');
    expect(sql).toContain('meter."unitId" = contract."unitId"');
    expect(sql).toContain("meter.type = 'electric'");
    expect(sql).toContain("meter.type = 'water'");
    expect(sql).toContain('ALTER COLUMN "electricUnitPrice" SET NOT NULL');
    expect(sql).toContain('ALTER COLUMN "electricLineLossPercent" SET NOT NULL');
    expect(sql).toContain('ALTER COLUMN "waterUnitPrice" SET NOT NULL');
  });

  it("removes only the contract utility term fields on rollback", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddContractUtilityTerms1712800000000().down(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(sql).toContain('DROP COLUMN IF EXISTS "waterUnitPrice"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "electricLineLossPercent"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "electricUnitPrice"');
    expect(sql).not.toContain("DROP TABLE");
  });
});
