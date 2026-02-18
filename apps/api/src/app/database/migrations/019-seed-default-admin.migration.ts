import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class SeedDefaultAdmin019Migration1762700000000
  implements MigrationInterface
{
  name = 'SeedDefaultAdmin019Migration1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO users (id, codigoAlumno, dni, fullName, role, passwordHash, createdAt, updatedAt)
      SELECT
        UUID(),
        NULL,
        'administrador',
        'Administrador UAI',
        'ADMIN',
        'PLAIN:Admin@UAI19',
        NOW(6),
        NOW(6)
      WHERE NOT EXISTS (
        SELECT 1 FROM users WHERE dni = 'administrador'
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM users
      WHERE dni = 'administrador' AND role = 'ADMIN';
    `);
  }
}
