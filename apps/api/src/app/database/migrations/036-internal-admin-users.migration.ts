import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InternalAdminUsers036Migration1774200000000
  implements MigrationInterface
{
  name = 'InternalAdminUsers036Migration1774200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('ALUMNO','ADMIN','DOCENTE','ADMINISTRATIVO') NOT NULL;
    `);

    if (!(await this.hasColumn(queryRunner, 'users', 'isActive'))) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1 AFTER role;
      `);
    }

    await queryRunner.query(`
      UPDATE users
      SET isActive = 1
      WHERE isActive IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET role = 'ADMIN'
      WHERE role = 'ADMINISTRATIVO';
    `);

    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('ALUMNO','ADMIN','DOCENTE') NOT NULL;
    `);

    if (await this.hasColumn(queryRunner, 'users', 'isActive')) {
      await queryRunner.query(`
        ALTER TABLE users
        DROP COLUMN isActive;
      `);
    }
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
}
