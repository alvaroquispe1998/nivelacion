import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopGroupScheduleZoomLinks052Migration1775600000000
  implements MigrationInterface
{
  name = 'WorkshopGroupScheduleZoomLinks052Migration1775600000000';

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
    if (!(await this.hasColumn(queryRunner, 'workshop_group_schedule_blocks', 'zoomMeetingRecordId'))) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        ADD COLUMN zoomMeetingRecordId CHAR(36)
          CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
          NULL AFTER endDate;
      `);
    }

    if (!(await this.hasColumn(queryRunner, 'workshop_group_schedule_blocks', 'joinUrl'))) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        ADD COLUMN joinUrl VARCHAR(1024) NULL AFTER zoomMeetingRecordId;
      `);
    }

    if (!(await this.hasColumn(queryRunner, 'workshop_group_schedule_blocks', 'startUrl'))) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        ADD COLUMN startUrl VARCHAR(2048) NULL AFTER joinUrl;
      `);
    }

    await queryRunner.query(`
      CREATE INDEX idx_wgs_zoom_meeting_record
      ON workshop_group_schedule_blocks (zoomMeetingRecordId);
    `).catch(() => undefined);

    if (
      (await this.hasColumn(queryRunner, 'workshop_group_schedule_blocks', 'zoomMeetingRecordId')) &&
      !(await this.hasConstraint(
        queryRunner,
        'workshop_group_schedule_blocks',
        'fk_wgs_zoom_meeting_record'
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        ADD CONSTRAINT fk_wgs_zoom_meeting_record
        FOREIGN KEY (zoomMeetingRecordId) REFERENCES zoom_meetings(id)
        ON DELETE SET NULL;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await this.hasConstraint(
        queryRunner,
        'workshop_group_schedule_blocks',
        'fk_wgs_zoom_meeting_record'
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        DROP FOREIGN KEY fk_wgs_zoom_meeting_record;
      `);
    }

    await queryRunner.query(`
      DROP INDEX idx_wgs_zoom_meeting_record ON workshop_group_schedule_blocks;
    `).catch(() => undefined);

    if (await this.hasColumn(queryRunner, 'workshop_group_schedule_blocks', 'startUrl')) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        DROP COLUMN startUrl;
      `);
    }

    if (await this.hasColumn(queryRunner, 'workshop_group_schedule_blocks', 'joinUrl')) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        DROP COLUMN joinUrl;
      `);
    }

    if (await this.hasColumn(queryRunner, 'workshop_group_schedule_blocks', 'zoomMeetingRecordId')) {
      await queryRunner.query(`
        ALTER TABLE workshop_group_schedule_blocks
        DROP COLUMN zoomMeetingRecordId;
      `);
    }
  }
}
