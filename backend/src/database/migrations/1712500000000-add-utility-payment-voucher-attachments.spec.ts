import { QueryRunner } from "typeorm";
import { AddUtilityPaymentVoucherAttachments1712500000000 } from "./1712500000000-add-utility-payment-voucher-attachments";

describe("AddUtilityPaymentVoucherAttachments1712500000000", () => {
  it("creates the utility payment voucher join table with cascading foreign keys and indexes", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const migration = new AddUtilityPaymentVoucherAttachments1712500000000();

    await migration.up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "utility_charge_record_attachment_files"');
    expect(sql).toContain('REFERENCES "utility_charge_records"("id") ON DELETE CASCADE');
    expect(sql).toContain('REFERENCES "stored_files"("id") ON DELETE CASCADE');
    expect(sql).toContain('IDX_utility_charge_record_attachment_files_recordId');
    expect(sql).toContain('IDX_utility_charge_record_attachment_files_fileId');
  });

  it("drops only the utility payment voucher join table", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const migration = new AddUtilityPaymentVoucherAttachments1712500000000();

    await migration.down(queryRunner);

    const downSql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
    expect(downSql).toContain('DROP TABLE IF EXISTS "utility_charge_record_attachment_files"');
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });
});
