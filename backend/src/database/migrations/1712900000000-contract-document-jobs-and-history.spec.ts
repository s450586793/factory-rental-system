import { QueryRunner } from "typeorm";
import { ContractDocumentJobsAndHistory1712900000000 } from "./1712900000000-contract-document-jobs-and-history";

describe("ContractDocumentJobsAndHistory1712900000000", () => {
  it("creates durable revision jobs and exact append-only history without changing business values", async () => {
    const runner = { query: jest.fn().mockResolvedValue(undefined) };
    await new ContractDocumentJobsAndHistory1712900000000().up(
      runner as unknown as QueryRunner,
    );
    const sql = runner.query.mock.calls.flat().join("\n");
    expect(sql).toContain('"contractId" uuid PRIMARY KEY');
    expect(sql).toContain('"payload" jsonb NOT NULL');
    expect(sql).toContain('"beforeValue" varchar');
    expect(sql).toContain('"afterValue" varchar NOT NULL');
    expect(sql).toContain("gen_random_uuid()");
    expect(sql).not.toContain('UPDATE "contracts"');
  });

  it("rolls back only its two new tables", async () => {
    const runner = { query: jest.fn().mockResolvedValue(undefined) };
    await new ContractDocumentJobsAndHistory1712900000000().down(
      runner as unknown as QueryRunner,
    );
    expect(runner.query.mock.calls).toEqual([
      ['DROP TABLE "contract_financial_history"'],
      ['DROP TABLE "contract_document_jobs"'],
    ]);
  });
});
