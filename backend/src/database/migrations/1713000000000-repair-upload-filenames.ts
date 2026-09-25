import { MigrationInterface, QueryRunner } from "typeorm";
import { normalizeUploadFilename } from "../../files/filename-encoding";

export class RepairUploadFilenames1713000000000 implements MigrationInterface {
  name = "RepairUploadFilenames1713000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const files: { id: string; originalName: string }[] = await queryRunner.query(
      'SELECT "id", "originalName" FROM "stored_files"',
    );
    for (const file of files) {
      const originalName = normalizeUploadFilename(file.originalName);
      if (originalName === file.originalName) continue;
      await queryRunner.query(
        'UPDATE "stored_files" SET "originalName" = $1 WHERE "id" = $2 AND "originalName" = $3',
        [originalName, file.id, file.originalName],
      );
    }
  }

  public async down(): Promise<void> {
    // 数据修复无需回滚为乱码；文件路径、内容和关联均保持原样。
  }
}
