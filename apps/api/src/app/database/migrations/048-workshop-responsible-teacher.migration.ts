import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopResponsibleTeacher048Migration1775200000000
  implements MigrationInterface
{
  name = 'WorkshopResponsibleTeacher048Migration1775200000000';

  private async hasColumn(queryRunner: QueryRunner, tableName: string, columnName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      `,
      [tableName, columnName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async hasConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      `,
      [tableName, constraintName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async hasIndex(queryRunner: QueryRunner, tableName: string, indexName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      `,
      [tableName, indexName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(queryRunner, 'workshops', 'responsibleTeacherId'))) {
      await queryRunner.query(`
        ALTER TABLE workshops
        ADD COLUMN responsibleTeacherId CHAR(36)
          CHARACTER SET utf8mb4
          COLLATE utf8mb4_0900_ai_ci
          NULL AFTER venueCampusName;
      `);
    }
    await queryRunner.query(`
      ALTER TABLE workshops
      MODIFY COLUMN responsibleTeacherId CHAR(36)
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_0900_ai_ci
        NULL;
    `);
    if (!(await this.hasIndex(queryRunner, 'workshops', 'idx_workshops_responsible_teacher'))) {
      await queryRunner.query(`
        CREATE INDEX idx_workshops_responsible_teacher
        ON workshops (responsibleTeacherId);
      `);
    }
    if (!(await this.hasConstraint(queryRunner, 'workshops', 'fk_workshops_responsible_teacher'))) {
      await queryRunner.query(`
        ALTER TABLE workshops
        ADD CONSTRAINT fk_workshops_responsible_teacher
        FOREIGN KEY (responsibleTeacherId) REFERENCES users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
      `);
    }

    if (!(await this.hasColumn(queryRunner, 'workshop_applications', 'responsibleTeacherId'))) {
      await queryRunner.query(`
        ALTER TABLE workshop_applications
        ADD COLUMN responsibleTeacherId VARCHAR(36) NULL AFTER appliedById;
      `);
    }
    if (!(await this.hasColumn(queryRunner, 'workshop_applications', 'responsibleTeacherDni'))) {
      await queryRunner.query(`
        ALTER TABLE workshop_applications
        ADD COLUMN responsibleTeacherDni VARCHAR(20) NULL AFTER responsibleTeacherId;
      `);
    }
    if (!(await this.hasColumn(queryRunner, 'workshop_applications', 'responsibleTeacherName'))) {
      await queryRunner.query(`
        ALTER TABLE workshop_applications
        ADD COLUMN responsibleTeacherName VARCHAR(255) NULL AFTER responsibleTeacherDni;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, 'workshop_applications', 'responsibleTeacherName')) {
      await queryRunner.query(`
        ALTER TABLE workshop_applications
        DROP COLUMN responsibleTeacherName;
      `);
    }
    if (await this.hasColumn(queryRunner, 'workshop_applications', 'responsibleTeacherDni')) {
      await queryRunner.query(`
        ALTER TABLE workshop_applications
        DROP COLUMN responsibleTeacherDni;
      `);
    }
    if (await this.hasColumn(queryRunner, 'workshop_applications', 'responsibleTeacherId')) {
      await queryRunner.query(`
        ALTER TABLE workshop_applications
        DROP COLUMN responsibleTeacherId;
      `);
    }

    if (await this.hasConstraint(queryRunner, 'workshops', 'fk_workshops_responsible_teacher')) {
      await queryRunner.query(`
        ALTER TABLE workshops
        DROP FOREIGN KEY fk_workshops_responsible_teacher;
      `);
    }
    if (await this.hasIndex(queryRunner, 'workshops', 'idx_workshops_responsible_teacher')) {
      await queryRunner.query(`
        DROP INDEX idx_workshops_responsible_teacher ON workshops;
      `);
    }
    if (await this.hasColumn(queryRunner, 'workshops', 'responsibleTeacherId')) {
      await queryRunner.query(`
        ALTER TABLE workshops
        DROP COLUMN responsibleTeacherId;
      `);
    }
  }
}
