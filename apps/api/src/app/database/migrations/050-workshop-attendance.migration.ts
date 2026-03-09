import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopAttendance050Migration1775400000000
  implements MigrationInterface
{
  name = 'WorkshopAttendance050Migration1775400000000';

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

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'workshop_attendance_sessions'))) {
      await queryRunner.query(`
        CREATE TABLE workshop_attendance_sessions (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          applicationId VARCHAR(36) NOT NULL,
          applicationGroupId VARCHAR(36) NOT NULL,
          sessionDate DATE NOT NULL,
          createdById VARCHAR(36) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_workshop_attendance_session_group_date (applicationGroupId, sessionDate),
          INDEX idx_workshop_attendance_sessions_application (applicationId),
          CONSTRAINT fk_workshop_attendance_session_application
            FOREIGN KEY (applicationId) REFERENCES workshop_applications(id)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_workshop_attendance_session_group
            FOREIGN KEY (applicationGroupId) REFERENCES workshop_application_groups(id)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    if (!(await this.tableExists(queryRunner, 'workshop_attendance_records'))) {
      await queryRunner.query(`
        CREATE TABLE workshop_attendance_records (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          sessionId VARCHAR(36) NOT NULL,
          studentId VARCHAR(36) NOT NULL,
          status VARCHAR(20) NOT NULL,
          notes VARCHAR(255) NULL,
          updatedById VARCHAR(36) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_workshop_attendance_record_student (sessionId, studentId),
          INDEX idx_workshop_attendance_records_student (studentId),
          CONSTRAINT fk_workshop_attendance_record_session
            FOREIGN KEY (sessionId) REFERENCES workshop_attendance_sessions(id)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_attendance_records;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_attendance_sessions;`);
  }
}
