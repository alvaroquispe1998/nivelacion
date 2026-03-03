import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MatriculationAudit037Migration1763600000000 implements MigrationInterface {
  name = 'MatriculationAudit037Migration1763600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS matriculation_audit (
        id CHAR(36) NOT NULL PRIMARY KEY,
        runId CHAR(36) NOT NULL,
        periodId CHAR(36) NOT NULL,
        studentId CHAR(36) NOT NULL,
        studentCode VARCHAR(50) NULL,
        studentName VARCHAR(200) NOT NULL,
        courseId CHAR(36) NOT NULL,
        courseName VARCHAR(200) NOT NULL,
        demandFacultyGroup VARCHAR(20) NULL,
        demandCampusName VARCHAR(120) NULL,
        assignedSectionId CHAR(36) NOT NULL,
        assignedSectionCode VARCHAR(50) NULL,
        assignedSectionName VARCHAR(200) NOT NULL,
        assignedSectionCourseId CHAR(36) NOT NULL,
        assignedCampusName VARCHAR(120) NULL,
        assignedModality VARCHAR(50) NULL,
        actorUserId CHAR(36) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT NOW(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    await queryRunner.query(
      `CREATE INDEX IX_matriculation_audit_runId ON matriculation_audit (runId);`
    );
    await queryRunner.query(
      `CREATE INDEX IX_matriculation_audit_studentId ON matriculation_audit (studentId);`
    );
    await queryRunner.query(
      `CREATE INDEX IX_matriculation_audit_sectionCourseId ON matriculation_audit (assignedSectionCourseId);`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS matriculation_audit;`);
  }
}
