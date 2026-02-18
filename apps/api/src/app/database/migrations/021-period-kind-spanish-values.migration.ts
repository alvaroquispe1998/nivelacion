import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class PeriodKindSpanishValues021Migration1762900000000
  implements MigrationInterface
{
  name = 'PeriodKindSpanishValues021Migration1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE periods
      SET kind = 'NIVELACION'
      WHERE kind = 'LEVELING';
    `);

    await queryRunner.query(`
      UPDATE periods
      SET kind = 'REGULAR'
      WHERE kind = 'SEMESTER';
    `);

    await queryRunner.query(`
      ALTER TABLE periods
      MODIFY COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'NIVELACION';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE periods
      SET kind = 'LEVELING'
      WHERE kind = 'NIVELACION';
    `);

    await queryRunner.query(`
      UPDATE periods
      SET kind = 'SEMESTER'
      WHERE kind = 'REGULAR';
    `);

    await queryRunner.query(`
      ALTER TABLE periods
      MODIFY COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'LEVELING';
    `);
  }
}
