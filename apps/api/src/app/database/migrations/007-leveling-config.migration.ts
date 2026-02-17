import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class LevelingConfig007Migration1761500000000
  implements MigrationInterface
{
  name = 'LevelingConfig007Migration1761500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leveling_config (
        id TINYINT UNSIGNED NOT NULL,
        initialCapacity INT UNSIGNED NOT NULL DEFAULT 45,
        maxExtraCapacity INT UNSIGNED NOT NULL DEFAULT 0,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      INSERT INTO leveling_config (id, initialCapacity, maxExtraCapacity)
      VALUES (1, 45, 0)
      ON DUPLICATE KEY UPDATE
        initialCapacity = VALUES(initialCapacity),
        maxExtraCapacity = VALUES(maxExtraCapacity);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS leveling_config;`);
  }
}
