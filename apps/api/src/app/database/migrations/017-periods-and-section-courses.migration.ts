import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class PeriodsAndSectionCourses017Migration1762500000000
  implements MigrationInterface
{
  name = 'PeriodsAndSectionCourses017Migration1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periods (
        id CHAR(36) NOT NULL,
        code VARCHAR(40) NOT NULL,
        name VARCHAR(120) NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'LEVELING',
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        startsAt DATE NULL,
        endsAt DATE NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_periods_code (code),
        KEY IX_periods_status (status)
      ) ENGINE=InnoDB;
    `);

    const hasAnyPeriods = await this.countRows(queryRunner, 'periods');
    if (hasAnyPeriods === 0) {
      await queryRunner.query(`
        INSERT INTO periods (id, code, name, kind, status, startsAt, endsAt, createdAt, updatedAt)
        VALUES (UUID(), 'LEGACY', 'LEGACY', 'LEVELING', 'ACTIVE', NULL, NULL, NOW(6), NOW(6));
      `);
    }

    const activeRows: Array<{ id: string }> = await queryRunner.query(`
      SELECT id
      FROM periods
      WHERE status = 'ACTIVE'
      ORDER BY updatedAt DESC, createdAt DESC
      LIMIT 1;
    `);
    let activePeriodId = String(activeRows[0]?.id ?? '').trim();
    if (!activePeriodId) {
      await queryRunner.query(`
        UPDATE periods
        SET status = 'ACTIVE'
        ORDER BY updatedAt DESC, createdAt DESC
        LIMIT 1;
      `);
      const fallbackRows: Array<{ id: string }> = await queryRunner.query(`
        SELECT id
        FROM periods
        WHERE status = 'ACTIVE'
        ORDER BY updatedAt DESC, createdAt DESC
        LIMIT 1;
      `);
      activePeriodId = String(fallbackRows[0]?.id ?? '').trim();
    }

    if (!activePeriodId) {
      await queryRunner.query(`
        INSERT INTO periods (id, code, name, kind, status, startsAt, endsAt, createdAt, updatedAt)
        VALUES (UUID(), 'DEFAULT', 'DEFAULT', 'LEVELING', 'ACTIVE', NULL, NULL, NOW(6), NOW(6));
      `);
      const rows: Array<{ id: string }> = await queryRunner.query(`
        SELECT id FROM periods WHERE code = 'DEFAULT' LIMIT 1;
      `);
      activePeriodId = String(rows[0]?.id ?? '').trim();
    }

    await this.addColumnIfMissing(
      queryRunner,
      'section_courses',
      'periodId',
      'CHAR(36) NULL AFTER sectionId'
    );

    await queryRunner.query(
      `
      UPDATE section_courses
      SET periodId = ?
      WHERE periodId IS NULL OR periodId = '';
      `,
      [activePeriodId]
    );

    if (
      !(await this.hasConstraint(
        queryRunner,
        'section_courses',
        'FK_section_courses_periodId'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE section_courses
        ADD CONSTRAINT FK_section_courses_periodId
        FOREIGN KEY (periodId) REFERENCES periods(id)
        ON DELETE RESTRICT;
      `);
    }

    if (!(await this.hasIndex(queryRunner, 'section_courses', 'IX_section_courses_periodId'))) {
      await queryRunner.query(`
        CREATE INDEX IX_section_courses_periodId ON section_courses (periodId);
      `);
    }

    if (
      await this.hasIndex(queryRunner, 'section_courses', 'UQ_section_courses_section_course')
    ) {
      await queryRunner.query(`
        DROP INDEX UQ_section_courses_section_course ON section_courses;
      `);
    }

    if (
      !(await this.hasIndex(
        queryRunner,
        'section_courses',
        'UQ_section_courses_period_section_course'
      ))
    ) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX UQ_section_courses_period_section_course
          ON section_courses (periodId, sectionId, courseId);
      `);
    }

    await queryRunner.query(`
      ALTER TABLE section_courses
      MODIFY COLUMN periodId CHAR(36) NOT NULL;
    `);

    if (
      await this.hasIndex(
        queryRunner,
        'section_student_courses',
        'UQ_section_student_courses_section_course_student'
      )
    ) {
      await queryRunner.query(`
        DROP INDEX UQ_section_student_courses_section_course_student
          ON section_student_courses;
      `);
    }

    if (
      await this.hasIndex(
        queryRunner,
        'section_course_teachers',
        'UQ_section_course_teachers_section_course'
      )
    ) {
      await queryRunner.query(`
        DROP INDEX UQ_section_course_teachers_section_course
          ON section_course_teachers;
      `);
    }

    await queryRunner.query(`DROP TABLE IF EXISTS enrollments;`);
  }

  public async down(): Promise<void> {
    throw new Error(
      'PeriodsAndSectionCourses017Migration1762500000000 is irreversible by design.'
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
    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql};`);
  }

  private async hasIndex(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      `,
      [tableName, indexName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async hasConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      `,
      [tableName, constraintName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async countRows(queryRunner: QueryRunner, tableName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM ${tableName};`
    );
    return Number(rows[0]?.c ?? 0);
  }
}

