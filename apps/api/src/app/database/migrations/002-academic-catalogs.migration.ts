import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class AcademicCatalogs002Migration1761000000000
  implements MigrationInterface
{
  name = 'AcademicCatalogs002Migration1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS FACULTAD (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(120) NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS CARRERA (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        idfacultad INT UNSIGNED NOT NULL,
        nombre VARCHAR(120) NOT NULL,
        PRIMARY KEY (id),
        KEY IX_CARRERA_idfacultad (idfacultad),
        CONSTRAINT FK_CARRERA_idfacultad
          FOREIGN KEY (idfacultad) REFERENCES FACULTAD(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS MODALIDAD (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(50) NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS SEDE (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(120) NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS CARRERA;`);
    await queryRunner.query(`DROP TABLE IF EXISTS FACULTAD;`);
    await queryRunner.query(`DROP TABLE IF EXISTS MODALIDAD;`);
    await queryRunner.query(`DROP TABLE IF EXISTS SEDE;`);
  }
}
