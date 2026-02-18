import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class CatalogsUuid016Migration1762400000000 implements MigrationInterface {
  name = 'CatalogsUuid016Migration1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.convertCoursesAndReferences(queryRunner);
    await this.convertFacultiesAndCareers(queryRunner);
    await this.convertSimpleCatalogTable(queryRunner, 'campuses');
    await this.convertSimpleCatalogTable(queryRunner, 'modalities');
  }

  public async down(): Promise<void> {
    throw new Error(
      'CatalogsUuid016Migration1762400000000 is irreversible by design.'
    );
  }

  private async convertCoursesAndReferences(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('courses'))) return;
    const idType = await this.getColumnType(queryRunner, 'courses', 'id');
    if (idType.startsWith('char')) return;

    await this.addColumnIfMissing(
      queryRunner,
      'courses',
      'id_uuid',
      'CHAR(36) NULL AFTER id'
    );
    await queryRunner.query(`
      UPDATE courses
      SET id_uuid = COALESCE(NULLIF(id_uuid, ''), UUID())
      WHERE id_uuid IS NULL OR id_uuid = '';
    `);

    const refs = ['section_courses', 'section_student_courses', 'section_course_teachers'];
    for (const tableName of refs) {
      if (!(await queryRunner.hasTable(tableName))) continue;
      await this.addColumnIfMissing(
        queryRunner,
        tableName,
        'courseId_uuid',
        'CHAR(36) NULL AFTER courseId'
      );
      await queryRunner.query(`
        UPDATE ${tableName} t
        INNER JOIN courses c ON c.id = t.courseId
        SET t.courseId_uuid = c.id_uuid
        WHERE t.courseId_uuid IS NULL;
      `);
    }

    await this.dropConstraintIfExists(
      queryRunner,
      'section_courses',
      'FK_section_courses_courseId'
    );
    await this.dropConstraintIfExists(
      queryRunner,
      'section_student_courses',
      'FK_section_student_courses_courseId'
    );
    await this.dropConstraintIfExists(
      queryRunner,
      'section_course_teachers',
      'FK_section_course_teachers_courseId'
    );

    await this.dropIndexIfExists(
      queryRunner,
      'section_courses',
      'UQ_section_courses_section_course'
    );
    await this.dropIndexIfExists(queryRunner, 'section_courses', 'IX_section_courses_courseId');

    await this.dropIndexIfExists(
      queryRunner,
      'section_student_courses',
      'UQ_section_student_courses_section_course_student'
    );
    await this.dropIndexIfExists(
      queryRunner,
      'section_student_courses',
      'IX_section_student_courses_courseId'
    );

    await this.dropIndexIfExists(
      queryRunner,
      'section_course_teachers',
      'UQ_section_course_teachers_section_course'
    );
    await this.dropIndexIfExists(
      queryRunner,
      'section_course_teachers',
      'IX_section_course_teachers_courseId'
    );

    await this.removeAutoIncrementFromIdIfNeeded(queryRunner, 'courses');
    await queryRunner.query(`ALTER TABLE courses DROP PRIMARY KEY;`);
    await queryRunner.query(`ALTER TABLE courses DROP COLUMN id;`);
    await queryRunner.query(
      `ALTER TABLE courses CHANGE COLUMN id_uuid id CHAR(36) NOT NULL;`
    );
    await queryRunner.query(`ALTER TABLE courses ADD PRIMARY KEY (id);`);

    for (const tableName of refs) {
      if (!(await queryRunner.hasTable(tableName))) continue;
      if (await this.hasColumn(queryRunner, tableName, 'courseId')) {
        await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN courseId;`);
      }
      await queryRunner.query(
        `ALTER TABLE ${tableName} CHANGE COLUMN courseId_uuid courseId CHAR(36) NOT NULL;`
      );
    }

    await this.addUniqueIndexIfMissing(
      queryRunner,
      'section_courses',
      'UQ_section_courses_section_course',
      'sectionId, courseId'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'section_courses',
      'IX_section_courses_courseId',
      'courseId'
    );

    await this.addUniqueIndexIfMissing(
      queryRunner,
      'section_student_courses',
      'UQ_section_student_courses_section_course_student',
      'sectionId, courseId, studentId'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'section_student_courses',
      'IX_section_student_courses_courseId',
      'courseId'
    );

    await this.addUniqueIndexIfMissing(
      queryRunner,
      'section_course_teachers',
      'UQ_section_course_teachers_section_course',
      'sectionId, courseId'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'section_course_teachers',
      'IX_section_course_teachers_courseId',
      'courseId'
    );

    await this.addConstraintIfMissing(
      queryRunner,
      'section_courses',
      'FK_section_courses_courseId',
      `
      ALTER TABLE section_courses
      ADD CONSTRAINT FK_section_courses_courseId
      FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE;
      `
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'section_student_courses',
      'FK_section_student_courses_courseId',
      `
      ALTER TABLE section_student_courses
      ADD CONSTRAINT FK_section_student_courses_courseId
      FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE;
      `
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'section_course_teachers',
      'FK_section_course_teachers_courseId',
      `
      ALTER TABLE section_course_teachers
      ADD CONSTRAINT FK_section_course_teachers_courseId
      FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE;
      `
    );
  }

  private async convertFacultiesAndCareers(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('faculties'))) return;
    if (!(await queryRunner.hasTable('careers'))) return;

    const idType = await this.getColumnType(queryRunner, 'faculties', 'id');
    if (idType.startsWith('char')) return;

    await this.addColumnIfMissing(
      queryRunner,
      'faculties',
      'id_uuid',
      'CHAR(36) NULL AFTER id'
    );
    await queryRunner.query(`
      UPDATE faculties
      SET id_uuid = COALESCE(NULLIF(id_uuid, ''), UUID())
      WHERE id_uuid IS NULL OR id_uuid = '';
    `);

    await this.addColumnIfMissing(
      queryRunner,
      'careers',
      'id_uuid',
      'CHAR(36) NULL AFTER id'
    );
    await queryRunner.query(`
      UPDATE careers
      SET id_uuid = COALESCE(NULLIF(id_uuid, ''), UUID())
      WHERE id_uuid IS NULL OR id_uuid = '';
    `);

    await this.addColumnIfMissing(
      queryRunner,
      'careers',
      'facultyId_uuid',
      'CHAR(36) NULL AFTER facultyId'
    );
    await queryRunner.query(`
      UPDATE careers c
      INNER JOIN faculties f ON f.id = c.facultyId
      SET c.facultyId_uuid = f.id_uuid
      WHERE c.facultyId_uuid IS NULL;
    `);

    await this.dropConstraintIfExists(queryRunner, 'careers', 'FK_careers_facultyId');
    await this.dropIndexIfExists(queryRunner, 'careers', 'IX_careers_facultyId');

    await this.removeAutoIncrementFromIdIfNeeded(queryRunner, 'faculties');
    await queryRunner.query(`ALTER TABLE faculties DROP PRIMARY KEY;`);
    await queryRunner.query(`ALTER TABLE faculties DROP COLUMN id;`);
    await queryRunner.query(
      `ALTER TABLE faculties CHANGE COLUMN id_uuid id CHAR(36) NOT NULL;`
    );
    await queryRunner.query(`ALTER TABLE faculties ADD PRIMARY KEY (id);`);

    await this.removeAutoIncrementFromIdIfNeeded(queryRunner, 'careers');
    await queryRunner.query(`ALTER TABLE careers DROP PRIMARY KEY;`);
    await queryRunner.query(`ALTER TABLE careers DROP COLUMN id;`);
    await queryRunner.query(
      `ALTER TABLE careers CHANGE COLUMN id_uuid id CHAR(36) NOT NULL;`
    );
    await queryRunner.query(`ALTER TABLE careers ADD PRIMARY KEY (id);`);

    await queryRunner.query(`ALTER TABLE careers DROP COLUMN facultyId;`);
    await queryRunner.query(
      `ALTER TABLE careers CHANGE COLUMN facultyId_uuid facultyId CHAR(36) NOT NULL;`
    );

    await this.addIndexIfMissing(queryRunner, 'careers', 'IX_careers_facultyId', 'facultyId');
    await this.addConstraintIfMissing(
      queryRunner,
      'careers',
      'FK_careers_facultyId',
      `
      ALTER TABLE careers
      ADD CONSTRAINT FK_careers_facultyId
      FOREIGN KEY (facultyId) REFERENCES faculties(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
      `
    );
  }

  private async convertSimpleCatalogTable(
    queryRunner: QueryRunner,
    tableName: string
  ) {
    if (!(await queryRunner.hasTable(tableName))) return;
    const idType = await this.getColumnType(queryRunner, tableName, 'id');
    if (idType.startsWith('char')) return;

    await this.addColumnIfMissing(
      queryRunner,
      tableName,
      'id_uuid',
      'CHAR(36) NULL AFTER id'
    );
    await queryRunner.query(`
      UPDATE ${tableName}
      SET id_uuid = COALESCE(NULLIF(id_uuid, ''), UUID())
      WHERE id_uuid IS NULL OR id_uuid = '';
    `);

    await this.removeAutoIncrementFromIdIfNeeded(queryRunner, tableName);
    await queryRunner.query(`ALTER TABLE ${tableName} DROP PRIMARY KEY;`);
    await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN id;`);
    await queryRunner.query(
      `ALTER TABLE ${tableName} CHANGE COLUMN id_uuid id CHAR(36) NOT NULL;`
    );
    await queryRunner.query(`ALTER TABLE ${tableName} ADD PRIMARY KEY (id);`);
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnSql: string
  ) {
    if (await this.hasColumn(queryRunner, tableName, columnName)) return;
    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql};`);
  }

  private async hasColumn(
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
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async getColumnType(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string
  ) {
    const rows: Array<{ dataType: string }> = await queryRunner.query(
      `
      SELECT DATA_TYPE AS dataType
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    return String(rows[0]?.dataType ?? '').toLowerCase();
  }

  private async removeAutoIncrementFromIdIfNeeded(
    queryRunner: QueryRunner,
    tableName: string
  ) {
    const rows: Array<{ extra: string; columnType: string }> = await queryRunner.query(
      `
      SELECT EXTRA AS extra, COLUMN_TYPE AS columnType
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'id'
      LIMIT 1
      `,
      [tableName]
    );
    const row = rows[0];
    if (!row) return;
    const extra = String(row.extra ?? '').toLowerCase();
    if (!extra.includes('auto_increment')) return;
    const columnType = String(row.columnType ?? '').trim();
    if (!columnType) return;
    await queryRunner.query(
      `ALTER TABLE ${tableName} MODIFY COLUMN id ${columnType} NOT NULL;`
    );
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

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string
  ) {
    if (!(await queryRunner.hasTable(tableName))) return;
    if (!(await this.hasIndex(queryRunner, tableName, indexName))) return;
    await queryRunner.query(`DROP INDEX ${indexName} ON ${tableName};`);
  }

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columnName: string
  ) {
    if (!(await queryRunner.hasTable(tableName))) return;
    if (await this.hasIndex(queryRunner, tableName, indexName)) return;
    await queryRunner.query(`CREATE INDEX ${indexName} ON ${tableName} (${columnName});`);
  }

  private async addUniqueIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columnsSql: string
  ) {
    if (!(await queryRunner.hasTable(tableName))) return;
    if (await this.hasIndex(queryRunner, tableName, indexName)) return;
    await queryRunner.query(
      `CREATE UNIQUE INDEX ${indexName} ON ${tableName} (${columnsSql});`
    );
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

  private async dropConstraintIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string
  ) {
    if (!(await queryRunner.hasTable(tableName))) return;
    if (!(await this.hasConstraint(queryRunner, tableName, constraintName))) return;
    await queryRunner.query(
      `ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraintName};`
    );
  }

  private async addConstraintIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    sql: string
  ) {
    if (!(await queryRunner.hasTable(tableName))) return;
    if (await this.hasConstraint(queryRunner, tableName, constraintName)) return;
    await queryRunner.query(sql);
  }
}
