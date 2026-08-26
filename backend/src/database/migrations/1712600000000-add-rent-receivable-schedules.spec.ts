import { QueryRunner } from "typeorm";
import { AddRentReceivableSchedules1712600000000 } from "./1712600000000-add-rent-receivable-schedules";

describe("AddRentReceivableSchedules1712600000000", () => {
  it("backfills annual schedules and interval-overlap payment allocations", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddRentReceivableSchedules1712600000000().up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "rent_receivable_schedules"',
    );
    expect(sql).toContain("UQ_rent_receivable_schedules_contract_sequence");
    expect(sql).toContain("generate_series");
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain("LEAST(payment_end_cents, schedule_end_cents)");
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "rent_payment_allocations"',
    );
    expect(sql).toContain("\"depositSettlementMode\" = 'carryover'");
  });

  it("removes only the new schedule schema and contract columns on rollback", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddRentReceivableSchedules1712600000000().down(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(
      sql.indexOf('DROP TABLE IF EXISTS "rent_payment_allocations"'),
    ).toBeLessThan(
      sql.indexOf('DROP TABLE IF EXISTS "rent_receivable_schedules"'),
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS "billingFrequency"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "depositSettlementMode"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "depositCarryoverAmount"');
    expect(sql).toContain(
      'DROP COLUMN IF EXISTS "depositCarryoverSourceContractId"',
    );
    expect(sql).not.toContain('DROP TABLE IF EXISTS "rent_payments"');
    expect(sql).not.toContain('DROP TABLE IF EXISTS "deposit_records"');
    expect(sql).not.toContain('DROP TABLE IF EXISTS "stored_files"');
  });
});
