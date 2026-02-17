import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class AcademicSeedAndCourses004Migration1761200000000
  implements MigrationInterface
{
  name = 'AcademicSeedAndCourses004Migration1761200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO faculties (name)
      SELECT 'CIENCIAS DE LA SALUD'
      WHERE NOT EXISTS (
        SELECT 1 FROM faculties WHERE name = 'CIENCIAS DE LA SALUD'
      );
    `);

    await queryRunner.query(`
      INSERT INTO faculties (name)
      SELECT 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
      WHERE NOT EXISTS (
        SELECT 1 FROM faculties WHERE name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
      );
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'ENFERMERÍA'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'ENFERMERÍA');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'OBSTETRICIA'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'OBSTETRICIA');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'PSICOLOGÍA'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'PSICOLOGÍA');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'MEDICINA HUMANA'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'MEDICINA HUMANA');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'TECNOLOGÍA MÉDICA - LABORATORIO CLÍNICO Y ANATOMÍA PATOLÓGICA'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (
          SELECT 1
          FROM careers c
          WHERE c.name = 'TECNOLOGÍA MÉDICA - LABORATORIO CLÍNICO Y ANATOMÍA PATOLÓGICA'
        );
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'TECNOLOGÍA MÉDICA - TERAPIA DE LENGUAJE'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (
          SELECT 1 FROM careers c WHERE c.name = 'TECNOLOGÍA MÉDICA - TERAPIA DE LENGUAJE'
        );
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'TECNOLOGÍA MÉDICA - TERAPIA FÍSICA Y REHABILITACIÓN'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (
          SELECT 1
          FROM careers c
          WHERE c.name = 'TECNOLOGÍA MÉDICA - TERAPIA FÍSICA Y REHABILITACIÓN'
        );
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'TECNOLOGÍA MÉDICA - OPTOMETRÍA'
      FROM faculties f
      WHERE f.name = 'CIENCIAS DE LA SALUD'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'TECNOLOGÍA MÉDICA - OPTOMETRÍA');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'ADMINISTRACIÓN DE EMPRESAS'
      FROM faculties f
      WHERE f.name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'ADMINISTRACIÓN DE EMPRESAS');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'DERECHO'
      FROM faculties f
      WHERE f.name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'DERECHO');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'INGENIERÍA INDUSTRIAL'
      FROM faculties f
      WHERE f.name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'INGENIERÍA INDUSTRIAL');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'ARQUITECTURA'
      FROM faculties f
      WHERE f.name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'ARQUITECTURA');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'INGENIERÍA CIVIL'
      FROM faculties f
      WHERE f.name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'INGENIERÍA CIVIL');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'INGENIERÍA DE SISTEMAS'
      FROM faculties f
      WHERE f.name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'INGENIERÍA DE SISTEMAS');
    `);

    await queryRunner.query(`
      INSERT INTO careers (facultyId, name)
      SELECT f.id, 'CONTABILIDAD'
      FROM faculties f
      WHERE f.name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
        AND NOT EXISTS (SELECT 1 FROM careers c WHERE c.name = 'CONTABILIDAD');
    `);

    await queryRunner.query(`
      INSERT INTO modalities (name)
      SELECT 'virtual'
      WHERE NOT EXISTS (SELECT 1 FROM modalities WHERE name = 'virtual');
    `);

    await queryRunner.query(`
      INSERT INTO modalities (name)
      SELECT 'presencial'
      WHERE NOT EXISTS (SELECT 1 FROM modalities WHERE name = 'presencial');
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(160) NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      INSERT INTO courses (name)
      SELECT 'COMUNICACIÓN'
      WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name = 'COMUNICACIÓN');
    `);

    await queryRunner.query(`
      INSERT INTO courses (name)
      SELECT 'HABILIDADES COMUNICATIVAS'
      WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name = 'HABILIDADES COMUNICATIVAS');
    `);

    await queryRunner.query(`
      INSERT INTO courses (name)
      SELECT 'MATEMATICA'
      WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name = 'MATEMATICA');
    `);

    await queryRunner.query(`
      INSERT INTO courses (name)
      SELECT 'CIENCIA, TECNOLOGÍA Y AMBIENTE'
      WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name = 'CIENCIA, TECNOLOGÍA Y AMBIENTE');
    `);

    await queryRunner.query(`
      INSERT INTO courses (name)
      SELECT 'CIENCIAS SOCIALES'
      WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name = 'CIENCIAS SOCIALES');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM courses
      WHERE name IN (
        'COMUNICACIÓN',
        'HABILIDADES COMUNICATIVAS',
        'MATEMATICA',
        'CIENCIA, TECNOLOGÍA Y AMBIENTE',
        'CIENCIAS SOCIALES'
      );
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS courses;`);

    await queryRunner.query(`
      DELETE FROM modalities
      WHERE name IN ('virtual', 'presencial');
    `);

    await queryRunner.query(`
      DELETE FROM careers
      WHERE name IN (
        'ENFERMERÍA',
        'OBSTETRICIA',
        'PSICOLOGÍA',
        'MEDICINA HUMANA',
        'TECNOLOGÍA MÉDICA - LABORATORIO CLÍNICO Y ANATOMÍA PATOLÓGICA',
        'TECNOLOGÍA MÉDICA - TERAPIA DE LENGUAJE',
        'TECNOLOGÍA MÉDICA - TERAPIA FÍSICA Y REHABILITACIÓN',
        'TECNOLOGÍA MÉDICA - OPTOMETRÍA',
        'ADMINISTRACIÓN DE EMPRESAS',
        'DERECHO',
        'INGENIERÍA INDUSTRIAL',
        'ARQUITECTURA',
        'INGENIERÍA CIVIL',
        'INGENIERÍA DE SISTEMAS',
        'CONTABILIDAD'
      );
    `);

    await queryRunner.query(`
      DELETE FROM faculties
      WHERE name IN ('CIENCIAS DE LA SALUD', 'INGENIERÍA, CIENCIAS Y HUMANIDADES');
    `);
  }
}
