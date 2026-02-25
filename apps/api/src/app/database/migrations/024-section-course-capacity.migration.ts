import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class SectionCourseCapacity024Migration1763200000000
  implements MigrationInterface
{
  name = 'SectionCourseCapacity024Migration1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'section_courses',
      'initialCapacity',
      'INT UNSIGNED NULL AFTER idakademic'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'section_courses',
      'maxExtraCapacity',
      'INT UNSIGNED NULL AFTER initialCapacity'
    );

    // Backfill from section defaults so existing section-courses have explicit values.
    await queryRunner.query(`
      UPDATE section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      SET
        sc.initialCapacity = COALESCE(sc.initialCapacity, s.initialCapacity),
        sc.maxExtraCapacity = COALESCE(sc.maxExtraCapacity, s.maxExtraCapacity)
      WHERE sc.initialCapacity IS NULL
         OR sc.maxExtraCapacity IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(queryRunner, 'section_courses', 'maxExtraCapacity');
    await this.dropColumnIfExists(queryRunner, 'section_courses', 'initialCapacity');
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnSql: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      `,
      [tableName, columnName]
    );
    if (Number(rows[0]?.c ?? 0) > 0) return;
    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql};`);
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      `,
      [tableName, columnName]
    );
    if (Number(rows[0]?.c ?? 0) === 0) return;
    await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName};`);
  }
}
