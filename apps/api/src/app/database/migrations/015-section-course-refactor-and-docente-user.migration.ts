import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class SectionCourseRefactorAndDocenteUser015Migration1762300000000
  implements MigrationInterface
{
  name = 'SectionCourseRefactorAndDocenteUser015Migration1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('ALUMNO','ADMIN','DOCENTE') NOT NULL;
    `);

    await this.addColumnIfMissing(
      queryRunner,
      'schedule_blocks',
      'sectionCourseId',
      'CHAR(36) NULL AFTER sectionId'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'section_student_courses',
      'sectionCourseId',
      'CHAR(36) NULL AFTER sectionId'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'section_course_teachers',
      'sectionCourseId',
      'CHAR(36) NULL AFTER sectionId'
    );

    await this.addIndexIfMissing(
      queryRunner,
      'schedule_blocks',
      'IX_schedule_blocks_sectionCourseId',
      'sectionCourseId'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'section_student_courses',
      'IX_section_student_courses_sectionCourseId',
      'sectionCourseId'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'section_course_teachers',
      'IX_section_course_teachers_sectionCourseId',
      'sectionCourseId'
    );

    await queryRunner.query(`
      UPDATE section_student_courses ssc
      INNER JOIN section_courses sc
        ON sc.sectionId = ssc.sectionId
       AND sc.courseId = ssc.courseId
      SET ssc.sectionCourseId = sc.id
      WHERE ssc.sectionCourseId IS NULL;
    `);

    await queryRunner.query(`
      UPDATE section_course_teachers sct
      INNER JOIN section_courses sc
        ON sc.sectionId = sct.sectionId
       AND sc.courseId = sct.courseId
      SET sct.sectionCourseId = sc.id
      WHERE sct.sectionCourseId IS NULL;
    `);

    await queryRunner.query(`
      UPDATE schedule_blocks sb
      INNER JOIN section_courses sc
        ON sc.sectionId = sb.sectionId
      INNER JOIN courses c
        ON c.id = sc.courseId
      SET sb.sectionCourseId = sc.id
      WHERE sb.sectionCourseId IS NULL
        AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.name, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), '.', ''), ',', ''), '  ', ' '), '  ', ' '), '  ', ' ')) =
            UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sb.courseName, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), '.', ''), ',', ''), '  ', ' '), '  ', ' '), '  ', ' '));
    `);

    await queryRunner.query(`
      UPDATE schedule_blocks sb
      INNER JOIN (
        SELECT sc.sectionId AS sectionId, MIN(sc.id) AS sectionCourseId, COUNT(*) AS c
        FROM section_courses sc
        GROUP BY sc.sectionId
        HAVING COUNT(*) = 1
      ) one_sc
        ON one_sc.sectionId = sb.sectionId
      SET sb.sectionCourseId = one_sc.sectionCourseId
      WHERE sb.sectionCourseId IS NULL;
    `);

    await queryRunner.query(`
      INSERT INTO users (id, codigoAlumno, dni, fullName, role, passwordHash, createdAt, updatedAt)
      SELECT
        UUID(),
        NULL,
        t.dni,
        t.fullName,
        'DOCENTE',
        CONCAT('PLAIN:', t.dni),
        NOW(6),
        NOW(6)
      FROM teachers t
      LEFT JOIN users u ON u.dni = t.dni
      WHERE u.id IS NULL;
    `);

    await queryRunner.query(`
      UPDATE users u
      INNER JOIN teachers t ON t.dni = u.dni
      SET
        u.fullName = t.fullName,
        u.role = CASE WHEN u.role = 'ADMIN' THEN 'ADMIN' ELSE 'DOCENTE' END,
        u.passwordHash = COALESCE(NULLIF(u.passwordHash, ''), CONCAT('PLAIN:', u.dni)),
        u.updatedAt = NOW(6);
    `);

    await queryRunner.query(`DROP TEMPORARY TABLE IF EXISTS tmp_teacher_user_map;`);
    await queryRunner.query(`
      CREATE TEMPORARY TABLE tmp_teacher_user_map
      SELECT t.id AS teacherId, u.id AS userId
      FROM teachers t
      INNER JOIN users u ON u.dni = t.dni;
    `);

    if (await this.hasConstraint(queryRunner, 'sections', 'FK_sections_teacherId')) {
      await queryRunner.query(`
        ALTER TABLE sections DROP FOREIGN KEY FK_sections_teacherId;
      `);
    }
    if (
      await this.hasConstraint(
        queryRunner,
        'section_course_teachers',
        'FK_section_course_teachers_teacherId'
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE section_course_teachers
        DROP FOREIGN KEY FK_section_course_teachers_teacherId;
      `);
    }

    await queryRunner.query(`
      UPDATE sections s
      INNER JOIN tmp_teacher_user_map m ON m.teacherId = s.teacherId
      SET s.teacherId = m.userId
      WHERE s.teacherId IS NOT NULL;
    `);

    await queryRunner.query(`
      UPDATE section_course_teachers sct
      INNER JOIN tmp_teacher_user_map m ON m.teacherId = sct.teacherId
      SET sct.teacherId = m.userId
      WHERE sct.teacherId IS NOT NULL;
    `);

    if (!(await this.hasConstraint(queryRunner, 'sections', 'FK_sections_teacherId'))) {
      await queryRunner.query(`
        ALTER TABLE sections
        ADD CONSTRAINT FK_sections_teacherId
        FOREIGN KEY (teacherId) REFERENCES users(id)
        ON DELETE SET NULL;
      `);
    }
    if (
      !(await this.hasConstraint(
        queryRunner,
        'section_course_teachers',
        'FK_section_course_teachers_teacherId'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE section_course_teachers
        ADD CONSTRAINT FK_section_course_teachers_teacherId
        FOREIGN KEY (teacherId) REFERENCES users(id)
        ON DELETE SET NULL;
      `);
    }

    if (
      !(await this.hasConstraint(
        queryRunner,
        'schedule_blocks',
        'FK_schedule_blocks_sectionCourseId'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        ADD CONSTRAINT FK_schedule_blocks_sectionCourseId
        FOREIGN KEY (sectionCourseId) REFERENCES section_courses(id)
        ON DELETE CASCADE;
      `);
    }
    if (
      !(await this.hasConstraint(
        queryRunner,
        'section_student_courses',
        'FK_section_student_courses_sectionCourseId'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE section_student_courses
        ADD CONSTRAINT FK_section_student_courses_sectionCourseId
        FOREIGN KEY (sectionCourseId) REFERENCES section_courses(id)
        ON DELETE CASCADE;
      `);
    }
    if (
      !(await this.hasConstraint(
        queryRunner,
        'section_course_teachers',
        'FK_section_course_teachers_sectionCourseId'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE section_course_teachers
        ADD CONSTRAINT FK_section_course_teachers_sectionCourseId
        FOREIGN KEY (sectionCourseId) REFERENCES section_courses(id)
        ON DELETE CASCADE;
      `);
    }

    if (
      !(await this.hasIndex(
        queryRunner,
        'section_student_courses',
        'UQ_section_student_courses_sectionCourse_student'
      ))
    ) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX UQ_section_student_courses_sectionCourse_student
          ON section_student_courses (sectionCourseId, studentId);
      `);
    }
    if (
      !(await this.hasIndex(
        queryRunner,
        'section_course_teachers',
        'UQ_section_course_teachers_sectionCourse'
      ))
    ) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX UQ_section_course_teachers_sectionCourse
          ON section_course_teachers (sectionCourseId);
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await this.hasConstraint(
        queryRunner,
        'schedule_blocks',
        'FK_schedule_blocks_sectionCourseId'
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks DROP FOREIGN KEY FK_schedule_blocks_sectionCourseId;
      `);
    }
    if (
      await this.hasConstraint(
        queryRunner,
        'section_student_courses',
        'FK_section_student_courses_sectionCourseId'
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE section_student_courses DROP FOREIGN KEY FK_section_student_courses_sectionCourseId;
      `);
    }
    if (
      await this.hasConstraint(
        queryRunner,
        'section_course_teachers',
        'FK_section_course_teachers_sectionCourseId'
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE section_course_teachers DROP FOREIGN KEY FK_section_course_teachers_sectionCourseId;
      `);
    }

    if (await this.hasConstraint(queryRunner, 'sections', 'FK_sections_teacherId')) {
      await queryRunner.query(`
        ALTER TABLE sections DROP FOREIGN KEY FK_sections_teacherId;
      `);
    }
    if (
      await this.hasConstraint(
        queryRunner,
        'section_course_teachers',
        'FK_section_course_teachers_teacherId'
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE section_course_teachers DROP FOREIGN KEY FK_section_course_teachers_teacherId;
      `);
    }

    await queryRunner.query(`
      UPDATE sections s
      INNER JOIN users u ON u.id = s.teacherId
      INNER JOIN teachers t ON t.dni = u.dni
      SET s.teacherId = t.id
      WHERE s.teacherId IS NOT NULL;
    `);

    await queryRunner.query(`
      UPDATE section_course_teachers sct
      INNER JOIN users u ON u.id = sct.teacherId
      INNER JOIN teachers t ON t.dni = u.dni
      SET sct.teacherId = t.id
      WHERE sct.teacherId IS NOT NULL;
    `);

    if (!(await this.hasConstraint(queryRunner, 'sections', 'FK_sections_teacherId'))) {
      await queryRunner.query(`
        ALTER TABLE sections
        ADD CONSTRAINT FK_sections_teacherId
        FOREIGN KEY (teacherId) REFERENCES teachers(id)
        ON DELETE SET NULL;
      `);
    }
    if (
      !(await this.hasConstraint(
        queryRunner,
        'section_course_teachers',
        'FK_section_course_teachers_teacherId'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE section_course_teachers
        ADD CONSTRAINT FK_section_course_teachers_teacherId
        FOREIGN KEY (teacherId) REFERENCES teachers(id)
        ON DELETE SET NULL;
      `);
    }

    if (
      await this.hasIndex(
        queryRunner,
        'section_student_courses',
        'UQ_section_student_courses_sectionCourse_student'
      )
    ) {
      await queryRunner.query(`
        DROP INDEX UQ_section_student_courses_sectionCourse_student
          ON section_student_courses;
      `);
    }
    if (
      await this.hasIndex(
        queryRunner,
        'section_course_teachers',
        'UQ_section_course_teachers_sectionCourse'
      )
    ) {
      await queryRunner.query(`
        DROP INDEX UQ_section_course_teachers_sectionCourse
          ON section_course_teachers;
      `);
    }

    const sectionCourseIndexes: Array<[string, string]> = [
      ['schedule_blocks', 'IX_schedule_blocks_sectionCourseId'],
      ['section_student_courses', 'IX_section_student_courses_sectionCourseId'],
      ['section_course_teachers', 'IX_section_course_teachers_sectionCourseId'],
    ];
    for (const [tableName, indexName] of sectionCourseIndexes) {
      if (await this.hasIndex(queryRunner, tableName, indexName)) {
        await queryRunner.query(`DROP INDEX ${indexName} ON ${tableName};`);
      }
    }

    await this.dropColumnIfExists(queryRunner, 'schedule_blocks', 'sectionCourseId');
    await this.dropColumnIfExists(
      queryRunner,
      'section_student_courses',
      'sectionCourseId'
    );
    await this.dropColumnIfExists(
      queryRunner,
      'section_course_teachers',
      'sectionCourseId'
    );

    await queryRunner.query(`
      UPDATE users
      SET role = 'ADMIN'
      WHERE role = 'DOCENTE';
    `);
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('ALUMNO','ADMIN') NOT NULL;
    `);
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
    if (await this.hasIndex(queryRunner, tableName, indexName)) return;
    await queryRunner.query(`CREATE INDEX ${indexName} ON ${tableName} (${columnName});`);
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
}
