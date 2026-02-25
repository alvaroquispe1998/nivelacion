import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentsExamDate027Migration1771682907120 implements MigrationInterface {
  name = 'StudentsExamDate027Migration1771682907120';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersExamDateRows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'examDate'
      `
    );
    if (Number(usersExamDateRows[0]?.c ?? 0) > 0) return;

    await queryRunner.query(
      `
      ALTER TABLE users
      ADD COLUMN examDate VARCHAR(255) NULL AFTER careerName
      `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersExamDateRows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'examDate'
      `
    );
    if (Number(usersExamDateRows[0]?.c ?? 0) === 0) return;

    await queryRunner.query(
      `
      ALTER TABLE users
      DROP COLUMN examDate
      `
    );
  }

}
