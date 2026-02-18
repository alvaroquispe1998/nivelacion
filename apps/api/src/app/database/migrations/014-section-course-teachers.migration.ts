import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class SectionCourseTeachers014Migration1762200000000
  implements MigrationInterface
{
  name = 'SectionCourseTeachers014Migration1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS section_course_teachers (
        id CHAR(36) NOT NULL,
        sectionId CHAR(36) NOT NULL,
        courseId INT UNSIGNED NOT NULL,
        teacherId CHAR(36) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_section_course_teachers_section_course (sectionId, courseId),
        KEY IX_section_course_teachers_sectionId (sectionId),
        KEY IX_section_course_teachers_courseId (courseId),
        KEY IX_section_course_teachers_teacherId (teacherId),
        CONSTRAINT FK_section_course_teachers_sectionId
          FOREIGN KEY (sectionId) REFERENCES sections(id) ON DELETE CASCADE,
        CONSTRAINT FK_section_course_teachers_courseId
          FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,
        CONSTRAINT FK_section_course_teachers_teacherId
          FOREIGN KEY (teacherId) REFERENCES teachers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS section_course_teachers;`);
  }
}
