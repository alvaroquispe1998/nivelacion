import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersCodigoAlumnoRoleIndex035Migration1774100000000
  implements MigrationInterface
{
  name = 'UsersCodigoAlumnoRoleIndex035Migration1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      CREATE INDEX IX_users_codigoAlumno_role
      ON users (codigoAlumno, role)
      `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DROP INDEX IX_users_codigoAlumno_role ON users
      `
    );
  }
}
