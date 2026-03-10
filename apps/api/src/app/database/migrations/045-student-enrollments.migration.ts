import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentEnrollments045Migration1763300000000
    implements MigrationInterface {
    name = 'StudentEnrollments045Migration1763300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS student_enrollments (
        id CHAR(36) NOT NULL,
        periodId CHAR(36) NOT NULL,
        studentId CHAR(36) NOT NULL,
        facultyGroup VARCHAR(20) NULL,
        campusName VARCHAR(120) NULL,
        careerName VARCHAR(200) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_student_enrollment_period_student (periodId, studentId),
        KEY IX_student_enrollments_periodId (periodId),
        KEY IX_student_enrollments_studentId (studentId),
        KEY IX_student_enrollments_faculty (facultyGroup),
        KEY IX_student_enrollments_campus (campusName)
      ) ENGINE=InnoDB;
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS student_enrollments;`);
    }
}
