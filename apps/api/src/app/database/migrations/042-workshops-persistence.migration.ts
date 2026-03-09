import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopsPersistenceMigration1774600000000 implements MigrationInterface {
  name = 'WorkshopsPersistenceMigration1774600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Stage 1: Applications table
    await queryRunner.query(`
      CREATE TABLE workshop_applications (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        workshopId VARCHAR(36) NOT NULL,
        periodId VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        mode ENUM('BY_SIZE','SINGLE') NOT NULL,
        groupSize INT NULL,
        selectionMode ENUM('ALL','MANUAL') NOT NULL,
        deliveryMode ENUM('VIRTUAL','PRESENCIAL') NOT NULL,
        venueCampusName VARCHAR(120) NULL,
        filtersJson JSON NULL,
        totalStudents INT NOT NULL DEFAULT 0,
        appliedById VARCHAR(36) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_wa_workshop (workshopId),
        INDEX idx_wa_period (periodId),
        CONSTRAINT fk_wa_workshop FOREIGN KEY (workshopId) REFERENCES workshops(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Stage 2: Groups generated in the application
    await queryRunner.query(`
      CREATE TABLE workshop_application_groups (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        applicationId VARCHAR(36) NOT NULL,
        groupIndex INT NOT NULL,
        studentCount INT NOT NULL DEFAULT 0,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_wag_application (applicationId),
        CONSTRAINT fk_wag_application FOREIGN KEY (applicationId) REFERENCES workshop_applications(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Stage 3: Students assigned to groups
    await queryRunner.query(`
      CREATE TABLE workshop_application_students (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        applicationId VARCHAR(36) NOT NULL,
        groupId VARCHAR(36) NOT NULL,
        studentId VARCHAR(36) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_was_application (applicationId),
        INDEX idx_was_group (groupId),
        INDEX idx_was_student (studentId),
        UNIQUE KEY uq_was_application_student (applicationId, studentId),
        CONSTRAINT fk_was_application FOREIGN KEY (applicationId) REFERENCES workshop_applications(id) ON DELETE CASCADE,
        CONSTRAINT fk_was_group FOREIGN KEY (groupId) REFERENCES workshop_application_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_application_students;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_application_groups;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workshop_applications;`);
  }
}
