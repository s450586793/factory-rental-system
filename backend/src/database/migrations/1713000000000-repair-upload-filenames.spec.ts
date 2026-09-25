import { QueryRunner } from "typeorm";
import { databaseMigrations } from "../typeorm.config";

function migration() {
  const Migration = databaseMigrations.find((entry) => entry.name === "RepairUploadFilenames1713000000000");
  expect(Migration).toBeDefined();
  return new Migration!();
}

describe("RepairUploadFilenames1713000000000", () => {
  it("repairs recoverable names without changing file contents, paths or associations", async () => {
    const originalName = Buffer.from("大理石租赁合同.pdf").toString("latin1");
    const rows = [
      { id: "broken", originalName },
      { id: "chinese", originalName: "已签合同.pdf" },
      { id: "ascii", originalName: "signed.pdf" },
      { id: "latin", originalName: "café.pdf" },
      { id: "invalid", originalName: "\u00e5\u00a4.pdf" },
    ];
    const runner = { query: jest.fn().mockResolvedValueOnce(rows).mockResolvedValue([]) };
    await migration().up(runner as unknown as QueryRunner);
    expect(runner.query).toHaveBeenCalledTimes(2);
    expect(runner.query).toHaveBeenLastCalledWith(
      'UPDATE "stored_files" SET "originalName" = $1 WHERE "id" = $2 AND "originalName" = $3',
      ["大理石租赁合同.pdf", "broken", originalName],
    );
  });

  it("leaves already repaired names unchanged on another run", async () => {
    const runner = { query: jest.fn().mockResolvedValue([{ id: "fixed", originalName: "大理石租赁合同.pdf" }]) };
    await migration().up(runner as unknown as QueryRunner);
    expect(runner.query).toHaveBeenCalledTimes(1);
  });

  it("does not restore garbled names on rollback", async () => {
    const runner = { query: jest.fn() };
    await migration().down(runner as unknown as QueryRunner);
    expect(runner.query).not.toHaveBeenCalled();
  });
});
