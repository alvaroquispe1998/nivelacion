import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class SectionStudentCourses012Migration1762000000000
  implements MigrationInterface
{
  name = 'SectionStudentCourses012Migration1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'courses',
      'idakademic',
      'VARCHAR(60) NULL AFTER name'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'courses',
      'IX_courses_idakademic',
      'idakademic'
    );

    await this.addColumnIfMissing(
      queryRunner,
      'section_courses',
      'idakademic',
      'VARCHAR(60) NULL AFTER courseId'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'section_courses',
      'IX_section_courses_idakademic',
      'idakademic'
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS section_student_courses (
        id CHAR(36) NOT NULL,
        sectionId CHAR(36) NOT NULL,
        courseId INT UNSIGNED NOT NULL,
        studentId CHAR(36) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_section_student_courses_section_course_student (sectionId, courseId, studentId),
        KEY IX_section_student_courses_sectionId (sectionId),
        KEY IX_section_student_courses_courseId (courseId),
        KEY IX_section_student_courses_studentId (studentId),
        CONSTRAINT FK_section_student_courses_sectionId FOREIGN KEY (sectionId) REFERENCES sections(id) ON DELETE CASCADE,
        CONSTRAINT FK_section_student_courses_courseId FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,
        CONSTRAINT FK_section_student_courses_studentId FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS section_student_courses;`);

    const hasSectionCoursesIndex = await this.hasIndex(
      queryRunner,
      'section_courses',
      'IX_section_courses_idakademic'
    );
    if (hasSectionCoursesIndex) {
      await queryRunner.query(`
        DROP INDEX IX_section_courses_idakademic ON section_courses;
      `);
    }
    await this.dropColumnIfExists(queryRunner, 'section_courses', 'idakademic');

    const hasCoursesIndex = await this.hasIndex(
      queryRunner,
      'courses',
      'IX_courses_idakademic'
    );
    if (hasCoursesIndex) {
      await queryRunner.query(`
        DROP INDEX IX_courses_idakademic ON courses;
      `);
    }
    await this.dropColumnIfExists(queryRunner, 'courses', 'idakademic');
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

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columnName: string
  ) {
    const exists = await this.hasIndex(queryRunner, tableName, indexName);
    if (exists) return;
    await queryRunner.query(`CREATE INDEX ${indexName} ON ${tableName} (${columnName});`);
  }
}
