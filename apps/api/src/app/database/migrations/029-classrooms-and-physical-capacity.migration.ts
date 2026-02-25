import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassroomsAndPhysicalCapacity029Migration1773500000000
  implements MigrationInterface
{
  name = 'ClassroomsAndPhysicalCapacity029Migration1773500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sectionCourseIdMeta = await this.getColumnMeta(
      queryRunner,
      'section_courses',
      'id'
    );
    if (!sectionCourseIdMeta) {
      throw new Error(
        'No se encontro metadata de section_courses.id para alinear FK de classrooms'
      );
    }

    const hasClassrooms = await this.tableExists(queryRunner, 'classrooms');
    if (!hasClassrooms) {
      const tableCollation = await this.getTableCollation(
        queryRunner,
        'section_courses'
      );
      await queryRunner.query(`
        CREATE TABLE classrooms (
          id ${sectionCourseIdMeta.columnType} NOT NULL PRIMARY KEY,
          campusName VARCHAR(120) NOT NULL,
          code VARCHAR(60) NOT NULL,
          name VARCHAR(160) NOT NULL,
          capacity INT UNSIGNED NOT NULL,
          type ENUM('AULA','LABORATORIO','AUDITORIO') NOT NULL DEFAULT 'AULA',
          status ENUM('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
          notes VARCHAR(255) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_classrooms_campus_code (campusName, code),
          KEY idx_classrooms_campus (campusName),
          KEY idx_classrooms_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${tableCollation ? ` COLLATE=${tableCollation}` : ''};
      `);
    }

    await this.alignClassroomsPrimaryKeyToSectionCoursesId(
      queryRunner,
      sectionCourseIdMeta
    );

    await this.addColumnIfMissing(
      queryRunner,
      'section_courses',
      'classroomId',
      `${sectionCourseIdMeta.columnType}${this.charsetCollationSql(
        sectionCourseIdMeta.charsetName,
        sectionCourseIdMeta.collationName
      )} NULL AFTER maxExtraCapacity`
    );

    await this.alignSectionCoursesClassroomIdToSectionCoursesId(
      queryRunner,
      sectionCourseIdMeta
    );

    await this.addIndexIfMissing(
      queryRunner,
      'section_courses',
      'idx_section_courses_classroom_id',
      'CREATE INDEX idx_section_courses_classroom_id ON section_courses (classroomId)'
    );

    await this.addForeignKeyIfMissing(
      queryRunner,
      'section_courses',
      'fk_section_courses_classroom',
      `
      ALTER TABLE section_courses
      ADD CONSTRAINT fk_section_courses_classroom
      FOREIGN KEY (classroomId) REFERENCES classrooms(id)
      ON DELETE SET NULL ON UPDATE CASCADE
      `
    );

    const hasAudit = await this.tableExists(queryRunner, 'section_course_reassignments');
    if (!hasAudit) {
      const tableCollation = await this.getTableCollation(
        queryRunner,
        'section_courses'
      );
      await queryRunner.query(`
        CREATE TABLE section_course_reassignments (
          id ${sectionCourseIdMeta.columnType} NOT NULL PRIMARY KEY,
          studentId ${sectionCourseIdMeta.columnType} NOT NULL,
          fromSectionCourseId ${sectionCourseIdMeta.columnType} NOT NULL,
          toSectionCourseId ${sectionCourseIdMeta.columnType} NOT NULL,
          reason VARCHAR(500) NULL,
          changedBy ${sectionCourseIdMeta.columnType} NULL,
          changedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          KEY idx_scr_student (studentId),
          KEY idx_scr_from_sc (fromSectionCourseId),
          KEY idx_scr_to_sc (toSectionCourseId),
          KEY idx_scr_changed_by (changedBy),
          CONSTRAINT fk_scr_student FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_scr_from_sc FOREIGN KEY (fromSectionCourseId) REFERENCES section_courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_scr_to_sc FOREIGN KEY (toSectionCourseId) REFERENCES section_courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_scr_changed_by FOREIGN KEY (changedBy) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${tableCollation ? ` COLLATE=${tableCollation}` : ''};
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropTableIfExists(queryRunner, 'section_course_reassignments');

    await this.dropForeignKeyIfExists(
      queryRunner,
      'section_courses',
      'fk_section_courses_classroom'
    );
    await this.dropIndexIfExists(
      queryRunner,
      'section_courses',
      'idx_section_courses_classroom_id'
    );
    await this.dropColumnIfExists(queryRunner, 'section_courses', 'classroomId');

    await this.dropTableIfExists(queryRunner, 'classrooms');
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

  private charsetCollationSql(
    charsetName: string | null,
    collationName: string | null
  ) {
    if (!charsetName || !collationName) return '';
    return ` CHARACTER SET ${charsetName} COLLATE ${collationName}`;
  }

  private async alignClassroomsPrimaryKeyToSectionCoursesId(
    queryRunner: QueryRunner,
    idMeta: {
      columnType: string;
      charsetName: string | null;
      collationName: string | null;
    }
  ) {
    const classroomsIdMeta = await this.getColumnMeta(queryRunner, 'classrooms', 'id');
    if (!classroomsIdMeta) return;
    await queryRunner.query(
      `
      ALTER TABLE classrooms
      MODIFY COLUMN id ${idMeta.columnType}${this.charsetCollationSql(
        idMeta.charsetName,
        idMeta.collationName
      )} NOT NULL
      `
    );
  }

  private async alignSectionCoursesClassroomIdToSectionCoursesId(
    queryRunner: QueryRunner,
    idMeta: {
      columnType: string;
      charsetName: string | null;
      collationName: string | null;
    }
  ) {
    const classroomIdMeta = await this.getColumnMeta(
      queryRunner,
      'section_courses',
      'classroomId'
    );
    if (!classroomIdMeta) return;
    await queryRunner.query(
      `
      ALTER TABLE section_courses
      MODIFY COLUMN classroomId ${idMeta.columnType}${this.charsetCollationSql(
        idMeta.charsetName,
        idMeta.collationName
      )} NULL
      `
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

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    createSql: string
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
    if (Number(rows[0]?.c ?? 0) > 0) return;
    await queryRunner.query(createSql);
  }

  private async dropIndexIfExists(
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
    if (Number(rows[0]?.c ?? 0) === 0) return;
    await queryRunner.query(`DROP INDEX ${indexName} ON ${tableName}`);
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    keyName: string,
    addSql: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      `,
      [tableName, keyName]
    );
    if (Number(rows[0]?.c ?? 0) > 0) return;
    await queryRunner.query(addSql);
  }

  private async dropForeignKeyIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    keyName: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      `,
      [tableName, keyName]
    );
    if (Number(rows[0]?.c ?? 0) === 0) return;
    await queryRunner.query(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${keyName}`);
  }

  private async dropTableIfExists(queryRunner: QueryRunner, tableName: string) {
    const exists = await this.tableExists(queryRunner, tableName);
    if (!exists) return;
    await queryRunner.query(`DROP TABLE ${tableName}`);
  }
}
