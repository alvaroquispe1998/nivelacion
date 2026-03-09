import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduleBlockZoomUrlLengths049Migration1775300000000
  implements MigrationInterface
{
  name = 'ScheduleBlockZoomUrlLengths049Migration1775300000000';

  private async hasColumn(queryRunner: QueryRunner, tableName: string, columnName: string) {
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

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, 'schedule_blocks', 'joinUrl')) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        MODIFY COLUMN joinUrl VARCHAR(1024) NULL;
      `);
    }

    if (await this.hasColumn(queryRunner, 'schedule_blocks', 'startUrl')) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        MODIFY COLUMN startUrl VARCHAR(2048) NULL;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, 'schedule_blocks', 'startUrl')) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        MODIFY COLUMN startUrl VARCHAR(500) NULL;
      `);
    }

    if (await this.hasColumn(queryRunner, 'schedule_blocks', 'joinUrl')) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        MODIFY COLUMN joinUrl VARCHAR(500) NULL;
      `);
    }
  }
}
