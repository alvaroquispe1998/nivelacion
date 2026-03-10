import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTechnicalRole053Migration1775700000000
  implements MigrationInterface
{
  name = 'SupportTechnicalRole053Migration1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('ALUMNO','ADMIN','DOCENTE','ADMINISTRATIVO','SOPORTE_TECNICO') NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET role = 'ADMINISTRATIVO'
      WHERE role = 'SOPORTE_TECNICO';
    `);

    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('ALUMNO','ADMIN','DOCENTE','ADMINISTRATIVO') NOT NULL;
    `);
  }
}
