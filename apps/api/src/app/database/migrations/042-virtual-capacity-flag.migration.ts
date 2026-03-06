import { MigrationInterface, QueryRunner } from 'typeorm';

export class VirtualCapacityFlag042Migration1774500000000 implements MigrationInterface {
  name = 'VirtualCapacityFlag042Migration1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sections
        ADD COLUMN enforceVirtualCapacity TINYINT(1) NOT NULL DEFAULT 0
        AFTER maxExtraCapacity;
    `);

    await queryRunner.query(`
      ALTER TABLE section_courses
        ADD COLUMN enforceVirtualCapacity TINYINT(1) NOT NULL DEFAULT 0
        AFTER maxExtraCapacity;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE section_courses
        DROP COLUMN enforceVirtualCapacity;
    `);

    await queryRunner.query(`
      ALTER TABLE sections
        DROP COLUMN enforceVirtualCapacity;
    `);
  }
}
