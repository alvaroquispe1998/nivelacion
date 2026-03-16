import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminChangeAudit054Migration1775800000000 implements MigrationInterface {
  name = 'AdminChangeAudit054Migration1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_change_audit (
        id CHAR(36) NOT NULL PRIMARY KEY,
        moduleName VARCHAR(60) NOT NULL,
        entityType VARCHAR(80) NOT NULL,
        entityId VARCHAR(64) NULL,
        entityLabel VARCHAR(255) NULL,
        action VARCHAR(30) NOT NULL,
        batchId CHAR(36) NULL,
        actorUserId CHAR(36) NULL,
        actorName VARCHAR(255) NULL,
        actorRole VARCHAR(40) NULL,
        changesJson LONGTEXT NULL,
        beforeJson LONGTEXT NULL,
        afterJson LONGTEXT NULL,
        metadataJson LONGTEXT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_admin_change_audit_module (moduleName),
        INDEX idx_admin_change_audit_entity (entityType, entityId),
        INDEX idx_admin_change_audit_actor (actorUserId),
        INDEX idx_admin_change_audit_batch (batchId),
        INDEX idx_admin_change_audit_created_at (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin_change_audit;`);
  }
}
