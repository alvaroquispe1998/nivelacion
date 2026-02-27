import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduleBlockReferenceFields033Migration1773900000000
  implements MigrationInterface
{
  name = 'ScheduleBlockReferenceFields033Migration1773900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await this.columnExists(
        queryRunner,
        'schedule_blocks',
        'referenceModality'
      ))
    ) {
      await queryRunner.query(
        `
        ALTER TABLE schedule_blocks
        ADD COLUMN referenceModality VARCHAR(20) NULL AFTER location
        `
      );
    }

    if (
      !(await this.columnExists(
        queryRunner,
        'schedule_blocks',
        'referenceClassroom'
      ))
    ) {
      await queryRunner.query(
        `
        ALTER TABLE schedule_blocks
        ADD COLUMN referenceClassroom VARCHAR(150) NULL AFTER referenceModality
        `
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await this.columnExists(queryRunner, 'schedule_blocks', 'referenceClassroom')
    ) {
      await queryRunner.query(
        `
        ALTER TABLE schedule_blocks
        DROP COLUMN referenceClassroom
        `
      );
    }

    if (
      await this.columnExists(queryRunner, 'schedule_blocks', 'referenceModality')
    ) {
      await queryRunner.query(
        `
        ALTER TABLE schedule_blocks
        DROP COLUMN referenceModality
        `
      );
    }
  }

  private async columnExists(
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

