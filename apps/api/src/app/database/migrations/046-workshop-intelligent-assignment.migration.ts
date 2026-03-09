import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopIntelligentAssignment046Migration1774900000000
  implements MigrationInterface
{
  name = 'WorkshopIntelligentAssignment046Migration1774900000000';

  private async tableExists(queryRunner: QueryRunner, tableName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      `,
      [tableName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async listColumns(queryRunner: QueryRunner, tableName: string) {
    const rows: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      `,
      [tableName]
    );
    return rows.map((row) => String(row.COLUMN_NAME));
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasGroups = await this.tableExists(queryRunner, 'workshop_groups');
    if (!hasGroups) {
      await queryRunner.query(`
        CREATE TABLE workshop_groups (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          workshopId VARCHAR(36) NOT NULL,
          code VARCHAR(32) NOT NULL,
          displayName VARCHAR(120) NOT NULL,
          capacity INT NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          isActive TINYINT(1) NOT NULL DEFAULT 1,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_workshop_group_code (workshopId, code),
          INDEX idx_workshop_groups_workshop_sort (workshopId, sortOrder),
          CONSTRAINT fk_workshop_groups_workshop FOREIGN KEY (workshopId)
            REFERENCES workshops(id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    const hasSchedule = await this.tableExists(
      queryRunner,
      'workshop_group_schedule_blocks'
    );
    if (!hasSchedule) {
      await queryRunner.query(`
        CREATE TABLE workshop_group_schedule_blocks (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          groupId VARCHAR(36) NOT NULL,
          dayOfWeek INT NOT NULL,
          startTime TIME NOT NULL,
          endTime TIME NOT NULL,
          startDate DATE NULL,
          endDate DATE NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_wgs_group_day_time (groupId, dayOfWeek, startTime, endTime),
          CONSTRAINT fk_wgs_group FOREIGN KEY (groupId)
            REFERENCES workshop_groups(id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    const hasPending = await this.tableExists(queryRunner, 'workshop_assignment_pending');
    if (!hasPending) {
      await queryRunner.query(`
        CREATE TABLE workshop_assignment_pending (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          applicationId VARCHAR(36) NOT NULL,
          studentId VARCHAR(36) NOT NULL,
          reasonCode VARCHAR(40) NOT NULL,
          reasonDetail VARCHAR(255) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_wap_application (applicationId),
          INDEX idx_wap_reason (reasonCode),
          CONSTRAINT fk_wap_application FOREIGN KEY (applicationId)
            REFERENCES workshop_applications(id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    const applicationGroupColumns = await this.listColumns(
      queryRunner,
      'workshop_application_groups'
    );
    if (!applicationGroupColumns.includes('sourceGroupId')) {
      await queryRunner.query(
        `ALTER TABLE workshop_application_groups ADD COLUMN sourceGroupId VARCHAR(36) NULL AFTER applicationId;`
      );
    }
    if (!applicationGroupColumns.includes('groupCode')) {
      await queryRunner.query(
        `ALTER TABLE workshop_application_groups ADD COLUMN groupCode VARCHAR(32) NULL AFTER sourceGroupId;`
      );
    }
    if (!applicationGroupColumns.includes('groupName')) {
      await queryRunner.query(
        `ALTER TABLE workshop_application_groups ADD COLUMN groupName VARCHAR(120) NULL AFTER groupCode;`
      );
    }
    if (!applicationGroupColumns.includes('capacitySnapshot')) {
      await queryRunner.query(
        `ALTER TABLE workshop_application_groups ADD COLUMN capacitySnapshot INT NULL AFTER studentCount;`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'workshop_application_groups')) {
      const cols = await this.listColumns(queryRunner, 'workshop_application_groups');
      if (cols.includes('capacitySnapshot')) {
        await queryRunner.query(
          `ALTER TABLE workshop_application_groups DROP COLUMN capacitySnapshot;`
        );
      }
      if (cols.includes('groupName')) {
        await queryRunner.query(
          `ALTER TABLE workshop_application_groups DROP COLUMN groupName;`
        );
      }
      if (cols.includes('groupCode')) {
        await queryRunner.query(
          `ALTER TABLE workshop_application_groups DROP COLUMN groupCode;`
        );
      }
      if (cols.includes('sourceGroupId')) {
        await queryRunner.query(
          `ALTER TABLE workshop_application_groups DROP COLUMN sourceGroupId;`
        );
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_assignment_pending;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_group_schedule_blocks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_groups;`);
  }
}
