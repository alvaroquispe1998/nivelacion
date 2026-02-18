import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class AllowMultiSectionPerStudent010Migration1761800000000
  implements MigrationInterface
{
  name = 'AllowMultiSectionPerStudent010Migration1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasIndexRows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'enrollments'
        AND INDEX_NAME = 'UQ_enrollments_studentId'
      `
    );
    if (Number(hasIndexRows[0]?.c ?? 0) > 0) {
      await queryRunner.query(`
        DROP INDEX UQ_enrollments_studentId ON enrollments;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasIndexRows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'enrollments'
        AND INDEX_NAME = 'UQ_enrollments_studentId'
      `
    );
    if (Number(hasIndexRows[0]?.c ?? 0) === 0) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX UQ_enrollments_studentId
        ON enrollments (studentId);
      `);
    }
  }
}
