import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduleBlockJoinStartUrls038Migration1763700000000 implements MigrationInterface {
  name = 'ScheduleBlockJoinStartUrls038Migration1763700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE schedule_blocks
      CHANGE zoomUrl joinUrl VARCHAR(500) NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_blocks
      ADD COLUMN startUrl VARCHAR(500) NULL AFTER joinUrl;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE schedule_blocks
      DROP COLUMN startUrl;
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_blocks
      CHANGE joinUrl zoomUrl VARCHAR(500) NULL;
    `);
  }
}
