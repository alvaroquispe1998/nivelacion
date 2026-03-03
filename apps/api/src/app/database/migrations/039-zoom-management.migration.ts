import { MigrationInterface, QueryRunner } from 'typeorm';

export class ZoomManagement039Migration1774300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Derive charset/collation from existing reference table
    const tableCollation = await this.getTableCollation(
      queryRunner,
      'periods',
    );
    const tableDefaults = this.tableDefaultsSql(tableCollation);

    // 1. zoom_config — global Zoom credentials
    if (!(await this.tableExists(queryRunner, 'zoom_config'))) {
      await queryRunner.query(`
        CREATE TABLE zoom_config (
          id char(36) NOT NULL PRIMARY KEY,
          accountId varchar(255) NOT NULL DEFAULT '',
          clientId varchar(255) NOT NULL DEFAULT '',
          clientSecret varchar(512) NOT NULL DEFAULT '',
          maxConcurrent int UNSIGNED NOT NULL DEFAULT 2,
          pageSize int UNSIGNED NOT NULL DEFAULT 20,
          timezone varchar(60) NOT NULL DEFAULT 'America/Lima',
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB${tableDefaults};
      `);
    }

    // 2. zoom_host_groups — group hosts by purpose
    if (!(await this.tableExists(queryRunner, 'zoom_host_groups'))) {
      await queryRunner.query(`
        CREATE TABLE zoom_host_groups (
          id char(36) NOT NULL PRIMARY KEY,
          name varchar(120) NOT NULL,
          status ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY uq_zoom_host_groups_name (name)
        ) ENGINE=InnoDB${tableDefaults};
      `);
    }

    // 3. zoom_hosts — individual Zoom host accounts
    if (!(await this.tableExists(queryRunner, 'zoom_hosts'))) {
      await queryRunner.query(`
        CREATE TABLE zoom_hosts (
          id char(36) NOT NULL PRIMARY KEY,
          groupId char(36) NOT NULL,
          email varchar(255) NOT NULL,
          status ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          KEY idx_zoom_hosts_group (groupId),
          KEY idx_zoom_hosts_email (email),
          CONSTRAINT fk_zoom_hosts_group
            FOREIGN KEY (groupId) REFERENCES zoom_host_groups(id)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB${tableDefaults};
      `);
    }

    // 4. zoom_meetings — log of created meetings
    if (!(await this.tableExists(queryRunner, 'zoom_meetings'))) {
      await queryRunner.query(`
        CREATE TABLE zoom_meetings (
          id char(36) NOT NULL PRIMARY KEY,
          periodId char(36) NULL,
          hostEmail varchar(255) NOT NULL,
          zoomMeetingId bigint NOT NULL,
          topic varchar(255) NOT NULL,
          agenda text NULL,
          startTime DATETIME NOT NULL,
          endTime DATETIME NOT NULL,
          duration int UNSIGNED NOT NULL,
          timezone varchar(60) NOT NULL DEFAULT 'America/Lima',
          joinUrl varchar(1024) NOT NULL DEFAULT '',
          startUrl varchar(2048) NOT NULL DEFAULT '',
          status ENUM('SCHEDULED','LIVE','ENDED','DELETED') NOT NULL DEFAULT 'SCHEDULED',
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          KEY idx_zoom_meetings_period (periodId),
          KEY idx_zoom_meetings_host (hostEmail),
          KEY idx_zoom_meetings_zoom_id (zoomMeetingId),
          KEY idx_zoom_meetings_status (status),
          CONSTRAINT fk_zoom_meetings_period
            FOREIGN KEY (periodId) REFERENCES periods(id)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB${tableDefaults};
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS zoom_meetings');
    await queryRunner.query('DROP TABLE IF EXISTS zoom_hosts');
    await queryRunner.query('DROP TABLE IF EXISTS zoom_host_groups');
    await queryRunner.query('DROP TABLE IF EXISTS zoom_config');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async tableExists(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [tableName],
    );
    return Number(result[0]?.cnt) > 0;
  }

  private async getTableCollation(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<string | null> {
    const rows = await queryRunner.query(
      `SELECT TABLE_COLLATION
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [tableName],
    );
    return rows[0]?.TABLE_COLLATION ?? null;
  }

  private tableDefaultsSql(collationName: string | null) {
    if (!collationName) return '';
    const charset = collationName.split('_')[0];
    return ` DEFAULT CHARSET=${charset} COLLATE=${collationName}`;
  }
}
