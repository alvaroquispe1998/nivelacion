import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class SeedCampuses005Migration1761300000000
  implements MigrationInterface
{
  name = 'SeedCampuses005Migration1761300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO campuses (name)
      SELECT 'FILIAL HUAURA'
      WHERE NOT EXISTS (SELECT 1 FROM campuses WHERE name = 'FILIAL HUAURA');
    `);

    await queryRunner.query(`
      INSERT INTO campuses (name)
      SELECT 'SEDE CHINCHA ALTA'
      WHERE NOT EXISTS (
        SELECT 1 FROM campuses WHERE name = 'SEDE CHINCHA ALTA'
      );
    `);

    await queryRunner.query(`
      INSERT INTO campuses (name)
      SELECT 'FILIAL ICA'
      WHERE NOT EXISTS (SELECT 1 FROM campuses WHERE name = 'FILIAL ICA');
    `);

    await queryRunner.query(`
      INSERT INTO campuses (name)
      SELECT 'SEDE CHINCHA'
      WHERE NOT EXISTS (SELECT 1 FROM campuses WHERE name = 'SEDE CHINCHA');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM campuses
      WHERE name IN (
        'FILIAL HUAURA',
        'SEDE CHINCHA ALTA',
        'FILIAL ICA',
        'SEDE CHINCHA'
      );
    `);
  }
}
