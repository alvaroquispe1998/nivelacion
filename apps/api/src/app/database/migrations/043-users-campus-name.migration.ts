import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersCampusName043Migration1774700000000
    implements MigrationInterface {
    name = 'UsersCampusName043Migration1774700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const columns = await queryRunner.query(
            `
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
      `
        ).then(rows => rows.map((r: any) => r.COLUMN_NAME));

        if (!columns.includes('campusName')) {
            await queryRunner.query(
                `ALTER TABLE users ADD COLUMN campusName VARCHAR(120) NULL AFTER careerName;`
            );
        }
        if (!columns.includes('facultyGroup')) {
            await queryRunner.query(
                `ALTER TABLE users ADD COLUMN facultyGroup VARCHAR(20) NULL AFTER campusName;`
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const columns = await queryRunner.query(
            `
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
      `
        ).then(rows => rows.map((r: any) => r.COLUMN_NAME));

        if (columns.includes('facultyGroup')) {
            await queryRunner.query(`ALTER TABLE users DROP COLUMN facultyGroup;`);
        }
        if (columns.includes('campusName')) {
            await queryRunner.query(`ALTER TABLE users DROP COLUMN campusName;`);
        }
    }
}
