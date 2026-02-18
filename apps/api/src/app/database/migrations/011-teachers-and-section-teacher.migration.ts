import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class TeachersAndSectionTeacher011Migration1761900000000
  implements MigrationInterface
{
  name = 'TeachersAndSectionTeacher011Migration1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id CHAR(36) NOT NULL,
        dni VARCHAR(20) NOT NULL,
        fullName VARCHAR(180) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_teachers_dni (dni),
        KEY IX_teachers_fullName (fullName)
      ) ENGINE=InnoDB;
    `);

    await this.addColumnIfMissing(
      queryRunner,
      'sections',
      'teacherId',
      'CHAR(36) NULL AFTER modality'
    );

    const hasIndex = await this.hasIndex(
      queryRunner,
      'sections',
      'IX_sections_teacherId'
    );
    if (!hasIndex) {
      await queryRunner.query(`
        CREATE INDEX IX_sections_teacherId ON sections (teacherId);
      `);
    }

    const hasFk = await this.hasConstraint(
      queryRunner,
      'sections',
      'FK_sections_teacherId'
    );
    if (!hasFk) {
      await queryRunner.query(`
        ALTER TABLE sections
        ADD CONSTRAINT FK_sections_teacherId
        FOREIGN KEY (teacherId) REFERENCES teachers(id)
        ON DELETE SET NULL;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasFk = await this.hasConstraint(
      queryRunner,
      'sections',
      'FK_sections_teacherId'
    );
    if (hasFk) {
      await queryRunner.query(`
        ALTER TABLE sections DROP FOREIGN KEY FK_sections_teacherId;
      `);
    }

    const hasIndex = await this.hasIndex(
      queryRunner,
      'sections',
      'IX_sections_teacherId'
    );
    if (hasIndex) {
      await queryRunner.query(`
        DROP INDEX IX_sections_teacherId ON sections;
      `);
    }

    await this.dropColumnIfExists(queryRunner, 'sections', 'teacherId');
    await queryRunner.query(`DROP TABLE IF EXISTS teachers;`);
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

