import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopsFiltersJson1774400000001 implements MigrationInterface {
  name = 'WorkshopsFiltersJson1774400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workshops
        ADD COLUMN facultyGroups JSON NULL AFTER facultyGroup,
        ADD COLUMN campusNames JSON NULL AFTER campusName,
        ADD COLUMN careerNames JSON NULL AFTER careerName;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workshops
        DROP COLUMN facultyGroups,
        DROP COLUMN campusNames,
        DROP COLUMN careerNames;
    `);
  }
}
