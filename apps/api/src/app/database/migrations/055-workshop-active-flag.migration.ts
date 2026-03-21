import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkshopActiveFlag055Migration1775900000000
  implements MigrationInterface
{
  name = 'WorkshopActiveFlag055Migration1775900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(queryRunner, 'workshops', 'isActive'))) {
      await queryRunner.query(`
        ALTER TABLE workshops
        ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1 AFTER responsibleTeacherId;
      `);
    }

    await queryRunner.query(`
      UPDATE workshops
      SET isActive = 1
      WHERE isActive IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, 'workshops', 'isActive')) {
      await queryRunner.query(`
        ALTER TABLE workshops
        DROP COLUMN isActive;
      `);
    }
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string
  ) {
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
}
