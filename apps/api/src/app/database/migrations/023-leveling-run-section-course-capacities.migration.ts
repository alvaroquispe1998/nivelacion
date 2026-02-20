import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class LevelingRunSectionCourseCapacities023Migration1763100000000
  implements MigrationInterface
{
  name = 'LevelingRunSectionCourseCapacities023Migration1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leveling_run_section_course_capacities (
        id CHAR(36) NOT NULL,
        runId CHAR(36) NOT NULL,
        sectionCourseId CHAR(36) NOT NULL,
        plannedCapacity INT UNSIGNED NOT NULL DEFAULT 0,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_leveling_run_section_course_capacities_run_section_course (runId, sectionCourseId),
        KEY IX_leveling_run_section_course_capacities_runId (runId),
        KEY IX_leveling_run_section_course_capacities_sectionCourseId (sectionCourseId),
        CONSTRAINT FK_leveling_run_section_course_capacities_runId
          FOREIGN KEY (runId) REFERENCES leveling_runs(id)
          ON DELETE CASCADE,
        CONSTRAINT FK_leveling_run_section_course_capacities_sectionCourseId
          FOREIGN KEY (sectionCourseId) REFERENCES section_courses(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS leveling_run_section_course_capacities;`);
  }
}
