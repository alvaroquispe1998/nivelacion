import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LevelingRunDemandExamAndModality028Migration1772500000000
  implements MigrationInterface
{
  name = 'LevelingRunDemandExamAndModality028Migration1772500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'leveling_run_student_course_demands',
      'sourceModality',
      'VARCHAR(20) NULL AFTER campusName'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'leveling_run_student_course_demands',
      'examDate',
      'VARCHAR(32) NULL AFTER sourceModality'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(
      queryRunner,
      'leveling_run_student_course_demands',
      'examDate'
    );
    await this.dropColumnIfExists(
      queryRunner,
      'leveling_run_student_course_demands',
      'sourceModality'
    );
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
    await queryRunner.query(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql};`
    );
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

