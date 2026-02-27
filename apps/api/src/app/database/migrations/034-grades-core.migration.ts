import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GradesCore034Migration1774000000000 implements MigrationInterface {
  name = 'GradesCore034Migration1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sectionCourseIdMeta = await this.getColumnMeta(
      queryRunner,
      'section_courses',
      'id'
    );
    const periodIdMeta = await this.getColumnMeta(queryRunner, 'periods', 'id');
    const userIdMeta = await this.getColumnMeta(queryRunner, 'users', 'id');
    if (!sectionCourseIdMeta || !periodIdMeta || !userIdMeta) {
      throw new Error(
        'No se encontro metadata base para crear tablas de notas (section_courses/periods/users)'
      );
    }
    const tableCollation = await this.getTableCollation(queryRunner, 'section_courses');

    if (!(await this.tableExists(queryRunner, 'grade_schemes'))) {
      await queryRunner.query(`
        CREATE TABLE grade_schemes (
          id ${sectionCourseIdMeta.columnType} NOT NULL PRIMARY KEY,
          periodId ${periodIdMeta.columnType}${this.charsetCollationSql(
            periodIdMeta.charsetName,
            periodIdMeta.collationName
          )} NOT NULL,
          status ENUM('DRAFT','LOCKED') NOT NULL DEFAULT 'DRAFT',
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_grade_schemes_period (periodId),
          KEY idx_grade_schemes_period (periodId),
          CONSTRAINT fk_grade_schemes_period
            FOREIGN KEY (periodId) REFERENCES periods(id)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${tableCollation ? ` COLLATE=${tableCollation}` : ''};
      `);
    }

    if (!(await this.tableExists(queryRunner, 'grade_scheme_components'))) {
      await queryRunner.query(`
        CREATE TABLE grade_scheme_components (
          id ${sectionCourseIdMeta.columnType} NOT NULL PRIMARY KEY,
          schemeId ${sectionCourseIdMeta.columnType}${this.charsetCollationSql(
            sectionCourseIdMeta.charsetName,
            sectionCourseIdMeta.collationName
          )} NOT NULL,
          code VARCHAR(40) NOT NULL,
          name VARCHAR(120) NOT NULL,
          weight DECIMAL(6,2) NOT NULL DEFAULT 0,
          orderIndex INT NOT NULL DEFAULT 0,
          minScore DECIMAL(6,2) NOT NULL DEFAULT 0,
          maxScore DECIMAL(6,2) NOT NULL DEFAULT 20,
          isActive TINYINT(1) NOT NULL DEFAULT 1,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_grade_scheme_component_code (schemeId, code),
          KEY idx_grade_scheme_components_scheme (schemeId),
          CONSTRAINT fk_grade_scheme_components_scheme
            FOREIGN KEY (schemeId) REFERENCES grade_schemes(id)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${tableCollation ? ` COLLATE=${tableCollation}` : ''};
      `);
    }

    if (!(await this.tableExists(queryRunner, 'section_course_grades'))) {
      await queryRunner.query(`
        CREATE TABLE section_course_grades (
          id ${sectionCourseIdMeta.columnType} NOT NULL PRIMARY KEY,
          sectionCourseId ${sectionCourseIdMeta.columnType}${this.charsetCollationSql(
            sectionCourseIdMeta.charsetName,
            sectionCourseIdMeta.collationName
          )} NOT NULL,
          studentId ${userIdMeta.columnType}${this.charsetCollationSql(
            userIdMeta.charsetName,
            userIdMeta.collationName
          )} NOT NULL,
          componentId ${sectionCourseIdMeta.columnType}${this.charsetCollationSql(
            sectionCourseIdMeta.charsetName,
            sectionCourseIdMeta.collationName
          )} NOT NULL,
          score DECIMAL(6,2) NOT NULL DEFAULT 0,
          updatedBy ${userIdMeta.columnType}${this.charsetCollationSql(
            userIdMeta.charsetName,
            userIdMeta.collationName
          )} NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_section_course_grades_unique (sectionCourseId, studentId, componentId),
          KEY idx_section_course_grades_section_course (sectionCourseId),
          KEY idx_section_course_grades_student (studentId),
          KEY idx_section_course_grades_component (componentId),
          KEY idx_section_course_grades_updated_by (updatedBy),
          CONSTRAINT fk_section_course_grades_section_course
            FOREIGN KEY (sectionCourseId) REFERENCES section_courses(id)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_section_course_grades_student
            FOREIGN KEY (studentId) REFERENCES users(id)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_section_course_grades_component
            FOREIGN KEY (componentId) REFERENCES grade_scheme_components(id)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_section_course_grades_updated_by
            FOREIGN KEY (updatedBy) REFERENCES users(id)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${tableCollation ? ` COLLATE=${tableCollation}` : ''};
      `);
    }

    if (!(await this.tableExists(queryRunner, 'section_course_grade_publications'))) {
      await queryRunner.query(`
        CREATE TABLE section_course_grade_publications (
          id ${sectionCourseIdMeta.columnType} NOT NULL PRIMARY KEY,
          sectionCourseId ${sectionCourseIdMeta.columnType}${this.charsetCollationSql(
            sectionCourseIdMeta.charsetName,
            sectionCourseIdMeta.collationName
          )} NOT NULL,
          periodId ${periodIdMeta.columnType}${this.charsetCollationSql(
            periodIdMeta.charsetName,
            periodIdMeta.collationName
          )} NOT NULL,
          isPublished TINYINT(1) NOT NULL DEFAULT 0,
          publishedAt DATETIME(6) NULL,
          publishedBy ${userIdMeta.columnType}${this.charsetCollationSql(
            userIdMeta.charsetName,
            userIdMeta.collationName
          )} NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_section_course_grade_publications_unique (sectionCourseId, periodId),
          KEY idx_section_course_grade_publications_section_course (sectionCourseId),
          KEY idx_section_course_grade_publications_period (periodId),
          KEY idx_section_course_grade_publications_published_by (publishedBy),
          CONSTRAINT fk_section_course_grade_publications_section_course
            FOREIGN KEY (sectionCourseId) REFERENCES section_courses(id)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_section_course_grade_publications_period
            FOREIGN KEY (periodId) REFERENCES periods(id)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_section_course_grade_publications_published_by
            FOREIGN KEY (publishedBy) REFERENCES users(id)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${tableCollation ? ` COLLATE=${tableCollation}` : ''};
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropTableIfExists(queryRunner, 'section_course_grade_publications');
    await this.dropTableIfExists(queryRunner, 'section_course_grades');
    await this.dropTableIfExists(queryRunner, 'grade_scheme_components');
    await this.dropTableIfExists(queryRunner, 'grade_schemes');
  }

  private charsetCollationSql(
    charsetName: string | null,
    collationName: string | null
  ) {
    if (!charsetName || !collationName) return '';
    return ` CHARACTER SET ${charsetName} COLLATE ${collationName}`;
  }

  private async getTableCollation(queryRunner: QueryRunner, tableName: string) {
    const rows: Array<{ tableCollation: string | null }> = await queryRunner.query(
      `
      SELECT TABLE_COLLATION AS tableCollation
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
      `,
      [tableName]
    );
    return String(rows[0]?.tableCollation ?? '').trim() || null;
  }

  private async getColumnMeta(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string
  ) {
    const rows: Array<{
      columnType: string;
      charsetName: string | null;
      collationName: string | null;
    }> = await queryRunner.query(
      `
      SELECT
        COLUMN_TYPE AS columnType,
        CHARACTER_SET_NAME AS charsetName,
        COLLATION_NAME AS collationName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    const row = rows[0];
    if (!row?.columnType) return null;
    return {
      columnType: String(row.columnType),
      charsetName: row.charsetName ? String(row.charsetName) : null,
      collationName: row.collationName ? String(row.collationName) : null,
    };
  }

  private async tableExists(queryRunner: QueryRunner, tableName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      `,
      [tableName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async dropTableIfExists(queryRunner: QueryRunner, tableName: string) {
    if (!(await this.tableExists(queryRunner, tableName))) return;
    await queryRunner.query(`DROP TABLE ${tableName}`);
  }
}

