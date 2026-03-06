import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopsMigration1774400000000 implements MigrationInterface {
  name = 'WorkshopsMigration1774400000000';

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
    const hasWorkshops = await this.tableExists(queryRunner, 'workshops');
    if (!hasWorkshops) {
      await queryRunner.query(`
        CREATE TABLE workshops (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          mode ENUM('BY_SIZE','SINGLE') NOT NULL DEFAULT 'BY_SIZE',
          groupSize INT NULL,
          selectionMode ENUM('ALL','MANUAL') NOT NULL DEFAULT 'ALL',
          facultyGroup VARCHAR(100) NULL,
          campusName VARCHAR(100) NULL,
          careerName VARCHAR(150) NULL,
          deliveryMode ENUM('VIRTUAL','PRESENCIAL') NOT NULL DEFAULT 'VIRTUAL',
          venueCampusName VARCHAR(120) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_workshops_faculty (facultyGroup),
          INDEX idx_workshops_campus (campusName),
          INDEX idx_workshops_career (careerName)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    const hasWorkshopStudents = await this.tableExists(queryRunner, 'workshop_students');
    if (!hasWorkshopStudents) {
      await queryRunner.query(`
        CREATE TABLE workshop_students (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          workshopId VARCHAR(36) NOT NULL,
          studentId VARCHAR(36) NOT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_workshop_student (workshopId, studentId),
          INDEX idx_ws_workshop (workshopId),
          INDEX idx_ws_student (studentId),
          CONSTRAINT fk_ws_workshop FOREIGN KEY (workshopId) REFERENCES workshops(id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_students;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workshops;`);
  }
}
