import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersCareerName026Migration1763400000000
  implements MigrationInterface
{
  name = 'UsersCareerName026Migration1763400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'careerName'
      `
    );
    if (Number(rows[0]?.c ?? 0) > 0) return;

    await queryRunner.query(
      `
      ALTER TABLE users
      ADD COLUMN careerName VARCHAR(200) NULL AFTER sex
      `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'careerName'
      `
    );
    if (Number(rows[0]?.c ?? 0) === 0) return;

    await queryRunner.query(
      `
      ALTER TABLE users
      DROP COLUMN careerName
      `
    );
  }
}

