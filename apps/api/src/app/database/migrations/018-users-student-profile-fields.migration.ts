import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class UsersStudentProfileFields018Migration1762600000000
  implements MigrationInterface
{
  name = 'UsersStudentProfileFields018Migration1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      'names',
      'VARCHAR(160) NULL AFTER fullName'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      'paternalLastName',
      'VARCHAR(120) NULL AFTER names'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      'maternalLastName',
      'VARCHAR(120) NULL AFTER paternalLastName'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      'email',
      'VARCHAR(200) NULL AFTER maternalLastName'
    );
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      'sex',
      'VARCHAR(20) NULL AFTER email'
    );

    await this.addIndexIfMissing(queryRunner, 'users', 'IX_users_email', 'email');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(queryRunner, 'users', 'IX_users_email')) {
      await queryRunner.query(`DROP INDEX IX_users_email ON users;`);
    }

    await this.dropColumnIfExists(queryRunner, 'users', 'sex');
    await this.dropColumnIfExists(queryRunner, 'users', 'email');
    await this.dropColumnIfExists(queryRunner, 'users', 'maternalLastName');
    await this.dropColumnIfExists(queryRunner, 'users', 'paternalLastName');
    await this.dropColumnIfExists(queryRunner, 'users', 'names');
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
}

