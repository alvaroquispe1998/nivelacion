import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class OneSectionPerStudent008Migration1761600000000
  implements MigrationInterface
{
  name = 'OneSectionPerStudent008Migration1761600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep the most recent enrollment per student before adding the unique index.
    await queryRunner.query(`
      DELETE e_old
      FROM enrollments e_old
      INNER JOIN enrollments e_newer
        ON e_old.studentId = e_newer.studentId
       AND (
         e_old.createdAt < e_newer.createdAt
         OR (e_old.createdAt = e_newer.createdAt AND e_old.id < e_newer.id)
       );
    `);

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
    if (Number(hasIndexRows[0]?.c ?? 0) > 0) {
      await queryRunner.query(`
        DROP INDEX UQ_enrollments_studentId ON enrollments;
      `);
    }
  }
}
