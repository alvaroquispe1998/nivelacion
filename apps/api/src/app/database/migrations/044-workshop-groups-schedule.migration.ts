import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopGroupsSchedule044Migration1774800000000
    implements MigrationInterface {
    name = 'WorkshopGroupsSchedule044Migration1774800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const columns = await queryRunner.query(
            `
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'workshop_application_groups'
      `
        ).then(rows => rows.map((r: any) => r.COLUMN_NAME));

        if (!columns.includes('dayOfWeek')) {
            await queryRunner.query(
                `ALTER TABLE workshop_application_groups ADD COLUMN dayOfWeek INT NULL AFTER studentCount;`
            );
        }
        if (!columns.includes('startTime')) {
            await queryRunner.query(
                `ALTER TABLE workshop_application_groups ADD COLUMN startTime TIME NULL AFTER dayOfWeek;`
            );
        }
        if (!columns.includes('endTime')) {
            await queryRunner.query(
                `ALTER TABLE workshop_application_groups ADD COLUMN endTime TIME NULL AFTER startTime;`
            );
        }
        if (!columns.includes('venueDetails')) {
            await queryRunner.query(
                `ALTER TABLE workshop_application_groups ADD COLUMN venueDetails VARCHAR(255) NULL AFTER endTime;`
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE workshop_application_groups DROP COLUMN venueDetails;`);
        await queryRunner.query(`ALTER TABLE workshop_application_groups DROP COLUMN endTime;`);
        await queryRunner.query(`ALTER TABLE workshop_application_groups DROP COLUMN startTime;`);
        await queryRunner.query(`ALTER TABLE workshop_application_groups DROP COLUMN dayOfWeek;`);
    }
}
