import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class AcademicCatalogsEnglish003Migration1761100000000
  implements MigrationInterface
{
  name = 'AcademicCatalogsEnglish003Migration1761100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOldFacultad = await queryRunner.hasTable('FACULTAD');
    const hasOldCarrera = await queryRunner.hasTable('CARRERA');
    const hasOldModalidad = await queryRunner.hasTable('MODALIDAD');
    const hasOldSede = await queryRunner.hasTable('SEDE');

    const hasFaculties = await queryRunner.hasTable('faculties');
    const hasCareers = await queryRunner.hasTable('careers');
    const hasModalities = await queryRunner.hasTable('modalities');
    const hasCampuses = await queryRunner.hasTable('campuses');

    if (!hasFaculties) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS faculties (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(120) NOT NULL,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB;
      `);
    }

    if (!hasModalities) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS modalities (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(50) NOT NULL,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB;
      `);
    }

    if (!hasCampuses) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS campuses (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(120) NOT NULL,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB;
      `);
    }

    if (!hasCareers) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS careers (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          facultyId INT UNSIGNED NOT NULL,
          name VARCHAR(120) NOT NULL,
          PRIMARY KEY (id),
          KEY IX_careers_facultyId (facultyId),
          CONSTRAINT FK_careers_facultyId
            FOREIGN KEY (facultyId) REFERENCES faculties(id)
            ON DELETE RESTRICT
            ON UPDATE CASCADE
        ) ENGINE=InnoDB;
      `);
    }

    if (hasOldFacultad) {
      await queryRunner.query(`
        INSERT INTO faculties (id, name)
        SELECT f.id, f.nombre
        FROM FACULTAD f
        LEFT JOIN faculties nf ON nf.id = f.id
        WHERE nf.id IS NULL;
      `);
    }

    if (hasOldModalidad) {
      await queryRunner.query(`
        INSERT INTO modalities (id, name)
        SELECT m.id, m.nombre
        FROM MODALIDAD m
        LEFT JOIN modalities nm ON nm.id = m.id
        WHERE nm.id IS NULL;
      `);
    }

    if (hasOldSede) {
      await queryRunner.query(`
        INSERT INTO campuses (id, name)
        SELECT s.id, s.nombre
        FROM SEDE s
        LEFT JOIN campuses nc ON nc.id = s.id
        WHERE nc.id IS NULL;
      `);
    }

    if (hasOldCarrera) {
      await queryRunner.query(`
        INSERT INTO careers (id, facultyId, name)
        SELECT c.id, c.idfacultad, c.nombre
        FROM CARRERA c
        LEFT JOIN careers nc ON nc.id = c.id
        WHERE nc.id IS NULL;
      `);
    }

    if (hasOldCarrera) {
      await queryRunner.query(`DROP TABLE IF EXISTS CARRERA;`);
    }
    if (hasOldFacultad) {
      await queryRunner.query(`DROP TABLE IF EXISTS FACULTAD;`);
    }
    if (hasOldModalidad) {
      await queryRunner.query(`DROP TABLE IF EXISTS MODALIDAD;`);
    }
    if (hasOldSede) {
      await queryRunner.query(`DROP TABLE IF EXISTS SEDE;`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasOldFacultad = await queryRunner.hasTable('FACULTAD');
    const hasOldCarrera = await queryRunner.hasTable('CARRERA');
    const hasOldModalidad = await queryRunner.hasTable('MODALIDAD');
    const hasOldSede = await queryRunner.hasTable('SEDE');

    const hasFaculties = await queryRunner.hasTable('faculties');
    const hasCareers = await queryRunner.hasTable('careers');
    const hasModalities = await queryRunner.hasTable('modalities');
    const hasCampuses = await queryRunner.hasTable('campuses');

    if (!hasOldFacultad) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS FACULTAD (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(120) NOT NULL,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB;
      `);
    }

    if (!hasOldModalidad) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS MODALIDAD (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(50) NOT NULL,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB;
      `);
    }

    if (!hasOldSede) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS SEDE (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(120) NOT NULL,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB;
      `);
    }

    if (!hasOldCarrera) {
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
    }

    if (hasFaculties) {
      await queryRunner.query(`
        INSERT INTO FACULTAD (id, nombre)
        SELECT f.id, f.name
        FROM faculties f
        LEFT JOIN FACULTAD ofa ON ofa.id = f.id
        WHERE ofa.id IS NULL;
      `);
    }

    if (hasModalities) {
      await queryRunner.query(`
        INSERT INTO MODALIDAD (id, nombre)
        SELECT m.id, m.name
        FROM modalities m
        LEFT JOIN MODALIDAD om ON om.id = m.id
        WHERE om.id IS NULL;
      `);
    }

    if (hasCampuses) {
      await queryRunner.query(`
        INSERT INTO SEDE (id, nombre)
        SELECT c.id, c.name
        FROM campuses c
        LEFT JOIN SEDE os ON os.id = c.id
        WHERE os.id IS NULL;
      `);
    }

    if (hasCareers) {
      await queryRunner.query(`
        INSERT INTO CARRERA (id, idfacultad, nombre)
        SELECT c.id, c.facultyId, c.name
        FROM careers c
        LEFT JOIN CARRERA oc ON oc.id = c.id
        WHERE oc.id IS NULL;
      `);
    }

    if (hasCareers) {
      await queryRunner.query(`DROP TABLE IF EXISTS careers;`);
    }
    if (hasFaculties) {
      await queryRunner.query(`DROP TABLE IF EXISTS faculties;`);
    }
    if (hasModalities) {
      await queryRunner.query(`DROP TABLE IF EXISTS modalities;`);
    }
    if (hasCampuses) {
      await queryRunner.query(`DROP TABLE IF EXISTS campuses;`);
    }
  }
}
