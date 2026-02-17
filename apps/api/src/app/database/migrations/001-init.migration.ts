import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class Init001Migration1760000000000 implements MigrationInterface {
  name = 'Init001Migration1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) NOT NULL,
        codigoAlumno VARCHAR(50) NULL,
        dni VARCHAR(20) NOT NULL,
        fullName VARCHAR(200) NOT NULL,
        role ENUM('ALUMNO','ADMIN') NOT NULL,
        passwordHash VARCHAR(255) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_users_dni (dni)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id CHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        akademicSectionId VARCHAR(60) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id CHAR(36) NOT NULL,
        sectionId CHAR(36) NOT NULL,
        studentId CHAR(36) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_enrollments_section_student (sectionId, studentId),
        KEY IX_enrollments_sectionId (sectionId),
        KEY IX_enrollments_studentId (studentId),
        CONSTRAINT FK_enrollments_sectionId FOREIGN KEY (sectionId) REFERENCES sections(id) ON DELETE CASCADE,
        CONSTRAINT FK_enrollments_studentId FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS schedule_blocks (
        id CHAR(36) NOT NULL,
        sectionId CHAR(36) NOT NULL,
        courseName VARCHAR(200) NOT NULL,
        dayOfWeek TINYINT NOT NULL,
        startTime CHAR(5) NOT NULL,
        endTime CHAR(5) NOT NULL,
        zoomUrl VARCHAR(500) NULL,
        location VARCHAR(200) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IX_schedule_blocks_sectionId (sectionId),
        KEY IX_schedule_blocks_sectionId_dayOfWeek (sectionId, dayOfWeek),
        CONSTRAINT FK_schedule_blocks_sectionId FOREIGN KEY (sectionId) REFERENCES sections(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id CHAR(36) NOT NULL,
        scheduleBlockId CHAR(36) NOT NULL,
        sessionDate DATE NOT NULL,
        createdById CHAR(36) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_attendance_sessions_block_date (scheduleBlockId, sessionDate),
        KEY IX_attendance_sessions_scheduleBlockId (scheduleBlockId),
        KEY IX_attendance_sessions_createdById (createdById),
        CONSTRAINT FK_attendance_sessions_scheduleBlockId FOREIGN KEY (scheduleBlockId) REFERENCES schedule_blocks(id) ON DELETE CASCADE,
        CONSTRAINT FK_attendance_sessions_createdById FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id CHAR(36) NOT NULL,
        attendanceSessionId CHAR(36) NOT NULL,
        studentId CHAR(36) NOT NULL,
        status ENUM('ASISTIO','FALTO') NOT NULL,
        notes TEXT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_attendance_records_session_student (attendanceSessionId, studentId),
        KEY IX_attendance_records_attendanceSessionId (attendanceSessionId),
        KEY IX_attendance_records_studentId (studentId),
        CONSTRAINT FK_attendance_records_attendanceSessionId FOREIGN KEY (attendanceSessionId) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
        CONSTRAINT FK_attendance_records_studentId FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_records;`);
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_sessions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedule_blocks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS enrollments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sections;`);
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
  }
}
