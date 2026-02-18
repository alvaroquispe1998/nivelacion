import type { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM expects migration class names to end with a JS timestamp.
export class RemoveLegacyDemoAdmin020Migration1762800000000
  implements MigrationInterface
{
  name = 'RemoveLegacyDemoAdmin020Migration1762800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM users
      WHERE role = 'ADMIN' AND dni = '00000000';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO users (id, codigoAlumno, dni, fullName, role, passwordHash, createdAt, updatedAt)
      SELECT
        UUID(),
        NULL,
        '00000000',
        'Administrador UAI',
        'ADMIN',
        'PLAIN:admin123',
        NOW(6),
        NOW(6)
      WHERE NOT EXISTS (
        SELECT 1 FROM users WHERE dni = '00000000'
      );
    `);
  }
}
