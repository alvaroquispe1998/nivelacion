import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class LevelingRunsAndStaging022Migration1763000000000
  implements MigrationInterface
{
  name = 'LevelingRunsAndStaging022Migration1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leveling_runs (
        id CHAR(36) NOT NULL,
        periodId CHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'STRUCTURED',
        configJson JSON NULL,
        sourceFileHash VARCHAR(128) NULL,
        createdBy CHAR(36) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IX_leveling_runs_periodId (periodId),
        KEY IX_leveling_runs_status (status),
        CONSTRAINT FK_leveling_runs_periodId
          FOREIGN KEY (periodId) REFERENCES periods(id)
          ON DELETE RESTRICT,
        CONSTRAINT FK_leveling_runs_createdBy
          FOREIGN KEY (createdBy) REFERENCES users(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leveling_run_student_course_demands (
        id CHAR(36) NOT NULL,
        runId CHAR(36) NOT NULL,
        studentId CHAR(36) NOT NULL,
        courseId CHAR(36) NOT NULL,
        facultyGroup VARCHAR(20) NULL,
        campusName VARCHAR(120) NULL,
        required TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_leveling_run_student_course_demands_run_student_course (runId, studentId, courseId),
        KEY IX_leveling_run_student_course_demands_runId (runId),
        KEY IX_leveling_run_student_course_demands_studentId (studentId),
        KEY IX_leveling_run_student_course_demands_courseId (courseId),
        CONSTRAINT FK_leveling_run_student_course_demands_runId
          FOREIGN KEY (runId) REFERENCES leveling_runs(id)
          ON DELETE CASCADE,
        CONSTRAINT FK_leveling_run_student_course_demands_studentId
          FOREIGN KEY (studentId) REFERENCES users(id)
          ON DELETE RESTRICT,
        CONSTRAINT FK_leveling_run_student_course_demands_courseId
          FOREIGN KEY (courseId) REFERENCES courses(id)
          ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await this.addColumnIfMissing(
      queryRunner,
      'sections',
      'levelingRunId',
      'CHAR(36) NULL AFTER isAutoLeveling'
    );
    await this.addIndexIfMissing(
      queryRunner,
      'sections',
      'IX_sections_levelingRunId',
      'levelingRunId'
    );
    if (
      !(await this.hasConstraint(queryRunner, 'sections', 'FK_sections_levelingRunId'))
    ) {
      await queryRunner.query(`
        ALTER TABLE sections
        ADD CONSTRAINT FK_sections_levelingRunId
        FOREIGN KEY (levelingRunId) REFERENCES leveling_runs(id)
        ON DELETE SET NULL;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasConstraint(queryRunner, 'sections', 'FK_sections_levelingRunId')) {
      await queryRunner.query(`
        ALTER TABLE sections DROP FOREIGN KEY FK_sections_levelingRunId;
      `);
    }
    if (await this.hasIndex(queryRunner, 'sections', 'IX_sections_levelingRunId')) {
      await queryRunner.query(`
        DROP INDEX IX_sections_levelingRunId ON sections;
      `);
    }
    await this.dropColumnIfExists(queryRunner, 'sections', 'levelingRunId');

    await queryRunner.query(`DROP TABLE IF EXISTS leveling_run_student_course_demands;`);
    await queryRunner.query(`DROP TABLE IF EXISTS leveling_runs;`);
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
