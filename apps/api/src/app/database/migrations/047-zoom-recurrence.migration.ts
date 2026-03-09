import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ZoomRecurrence047Migration1775100000000
  implements MigrationInterface
{
  name = 'ZoomRecurrence047Migration1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await this.getColumns(queryRunner, 'zoom_meetings');

    if (!columns.includes('meetingMode')) {
      await queryRunner.query(`
        ALTER TABLE zoom_meetings
        ADD COLUMN meetingMode ENUM('ONE_TIME','RECURRING') NOT NULL DEFAULT 'ONE_TIME'
        AFTER duration;
      `);
    }

    if (!columns.includes('recurrenceType')) {
      await queryRunner.query(`
        ALTER TABLE zoom_meetings
        ADD COLUMN recurrenceType VARCHAR(20) NULL
        AFTER meetingMode;
      `);
    }

    if (!columns.includes('repeatInterval')) {
      await queryRunner.query(`
        ALTER TABLE zoom_meetings
        ADD COLUMN repeatInterval INT UNSIGNED NULL
        AFTER recurrenceType;
      `);
    }

    if (!columns.includes('weeklyDays')) {
      await queryRunner.query(`
        ALTER TABLE zoom_meetings
        ADD COLUMN weeklyDays VARCHAR(32) NULL
        AFTER repeatInterval;
      `);
    }

    if (!columns.includes('recurrenceEndMode')) {
      await queryRunner.query(`
        ALTER TABLE zoom_meetings
        ADD COLUMN recurrenceEndMode VARCHAR(20) NULL
        AFTER weeklyDays;
      `);
    }

    if (!columns.includes('recurrenceEndDate')) {
      await queryRunner.query(`
        ALTER TABLE zoom_meetings
        ADD COLUMN recurrenceEndDate DATE NULL
        AFTER recurrenceEndMode;
      `);
    }

    if (!columns.includes('recurrenceEndTimes')) {
      await queryRunner.query(`
        ALTER TABLE zoom_meetings
        ADD COLUMN recurrenceEndTimes INT UNSIGNED NULL
        AFTER recurrenceEndDate;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = await this.getColumns(queryRunner, 'zoom_meetings');

    if (columns.includes('recurrenceEndTimes')) {
      await queryRunner.query(
        `ALTER TABLE zoom_meetings DROP COLUMN recurrenceEndTimes;`,
      );
    }
    if (columns.includes('recurrenceEndDate')) {
      await queryRunner.query(
        `ALTER TABLE zoom_meetings DROP COLUMN recurrenceEndDate;`,
      );
    }
    if (columns.includes('recurrenceEndMode')) {
      await queryRunner.query(
        `ALTER TABLE zoom_meetings DROP COLUMN recurrenceEndMode;`,
      );
    }
    if (columns.includes('weeklyDays')) {
      await queryRunner.query(
        `ALTER TABLE zoom_meetings DROP COLUMN weeklyDays;`,
      );
    }
    if (columns.includes('repeatInterval')) {
      await queryRunner.query(
        `ALTER TABLE zoom_meetings DROP COLUMN repeatInterval;`,
      );
    }
    if (columns.includes('recurrenceType')) {
      await queryRunner.query(
        `ALTER TABLE zoom_meetings DROP COLUMN recurrenceType;`,
      );
    }
    if (columns.includes('meetingMode')) {
      await queryRunner.query(
        `ALTER TABLE zoom_meetings DROP COLUMN meetingMode;`,
      );
    }
  }

  private async getColumns(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<string[]> {
    const rows = await queryRunner.query(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
      `,
      [tableName],
    );

    return rows.map((row: { COLUMN_NAME: string }) => row.COLUMN_NAME);
  }
}
