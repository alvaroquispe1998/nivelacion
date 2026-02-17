import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class SectionLevelingFields006Migration1761400000000
  implements MigrationInterface
{
  name = 'SectionLevelingFields006Migration1761400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'code',
      'VARCHAR(30) NULL AFTER name'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'facultyGroup',
      'VARCHAR(20) NULL AFTER akademicSectionId'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'facultyName',
      'VARCHAR(160) NULL AFTER facultyGroup'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'campusName',
      'VARCHAR(120) NULL AFTER facultyName'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'modality',
      'VARCHAR(20) NULL AFTER campusName'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'initialCapacity',
      'INT UNSIGNED NOT NULL DEFAULT 45 AFTER modality'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'maxExtraCapacity',
      'INT UNSIGNED NOT NULL DEFAULT 0 AFTER initialCapacity'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'isAutoLeveling',
      'TINYINT(1) NOT NULL DEFAULT 0 AFTER maxExtraCapacity'
    );

    const hasIndex = await this.hasIndex(queryRunner, 'UQ_sections_code');
    if (!hasIndex) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX UQ_sections_code ON sections (code);
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasIndex = await this.hasIndex(queryRunner, 'UQ_sections_code');
    if (hasIndex) {
      await queryRunner.query(`
        DROP INDEX UQ_sections_code ON sections;
      `);
    }

    await this.dropColumnIfExists(queryRunner, 'isAutoLeveling');
    await this.dropColumnIfExists(queryRunner, 'maxExtraCapacity');
    await this.dropColumnIfExists(queryRunner, 'initialCapacity');
    await this.dropColumnIfExists(queryRunner, 'modality');
    await this.dropColumnIfExists(queryRunner, 'campusName');
    await this.dropColumnIfExists(queryRunner, 'facultyName');
    await this.dropColumnIfExists(queryRunner, 'facultyGroup');
    await this.dropColumnIfExists(queryRunner, 'code');
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    columnName: string,
    columnSql: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sections'
        AND COLUMN_NAME = ?
      `,
      [columnName]
    );
    if (Number(rows[0]?.c ?? 0) > 0) return;
    await queryRunner.query(`ALTER TABLE sections ADD COLUMN ${columnName} ${columnSql};`);
  }

  private async dropColumnIfExists(queryRunner: QueryRunner, columnName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sections'
        AND COLUMN_NAME = ?
      `,
      [columnName]
    );
    if (Number(rows[0]?.c ?? 0) === 0) return;
    await queryRunner.query(`ALTER TABLE sections DROP COLUMN ${columnName};`);
  }

  private async hasIndex(queryRunner: QueryRunner, indexName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sections'
        AND INDEX_NAME = ?
      `,
      [indexName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }
}
