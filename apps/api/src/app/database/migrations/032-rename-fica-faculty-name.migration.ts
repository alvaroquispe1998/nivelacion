import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameFicaFacultyName032Migration1773800000000
  implements MigrationInterface
{
  name = 'RenameFicaFacultyName032Migration1773800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE faculties
      SET name = 'INGENIERÍA, CIENCIAS Y ADMINISTRACIÓN'
      WHERE UPPER(COALESCE(name, '')) IN (
        'INGENIERIA, CIENCIAS Y HUMANIDADES',
        'INGENIERÍA, CIENCIAS Y HUMANIDADES',
        'INGENIERIA CIENCIAS Y HUMANIDADES'
      )
      `
    );

    await queryRunner.query(
      `
      UPDATE sections
      SET facultyName = 'INGENIERÍA, CIENCIAS Y ADMINISTRACIÓN'
      WHERE UPPER(COALESCE(facultyGroup, '')) = 'FICA'
      `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE faculties
      SET name = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
      WHERE UPPER(COALESCE(name, '')) = 'INGENIERÍA, CIENCIAS Y ADMINISTRACIÓN'
      `
    );

    await queryRunner.query(
      `
      UPDATE sections
      SET facultyName = 'INGENIERÍA, CIENCIAS Y HUMANIDADES'
      WHERE UPPER(COALESCE(facultyGroup, '')) = 'FICA'
      `
    );
  }
}

