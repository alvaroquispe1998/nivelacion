import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduleBlockZoomMeetingRecord051Migration1775500000000
  implements MigrationInterface
{
  name = 'ScheduleBlockZoomMeetingRecord051Migration1775500000000';

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

  private async hasConstraint(queryRunner: QueryRunner, tableName: string, constraintName: string) {
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

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(queryRunner, 'schedule_blocks', 'zoomMeetingRecordId'))) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        ADD COLUMN zoomMeetingRecordId CHAR(36) NULL AFTER endDate;
      `);
    }

    await queryRunner.query(`
      CREATE INDEX idx_schedule_blocks_zoom_meeting_record
      ON schedule_blocks (zoomMeetingRecordId);
    `).catch(() => undefined);

    if (
      (await this.hasColumn(queryRunner, 'schedule_blocks', 'zoomMeetingRecordId')) &&
      !(await this.hasConstraint(
        queryRunner,
        'schedule_blocks',
        'fk_schedule_blocks_zoom_meeting_record'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        ADD CONSTRAINT fk_schedule_blocks_zoom_meeting_record
        FOREIGN KEY (zoomMeetingRecordId) REFERENCES zoom_meetings(id)
        ON DELETE SET NULL;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await this.hasConstraint(
        queryRunner,
        'schedule_blocks',
        'fk_schedule_blocks_zoom_meeting_record'
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        DROP FOREIGN KEY fk_schedule_blocks_zoom_meeting_record;
      `);
    }

    await queryRunner.query(`
      DROP INDEX idx_schedule_blocks_zoom_meeting_record ON schedule_blocks;
    `).catch(() => undefined);

    if (await this.hasColumn(queryRunner, 'schedule_blocks', 'zoomMeetingRecordId')) {
      await queryRunner.query(`
        ALTER TABLE schedule_blocks
        DROP COLUMN zoomMeetingRecordId;
      `);
    }
  }
}
