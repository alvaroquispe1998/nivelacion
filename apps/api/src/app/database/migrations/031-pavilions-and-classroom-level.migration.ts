import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PavilionsAndClassroomLevel031Migration1773700000000
  implements MigrationInterface
{
  name = 'PavilionsAndClassroomLevel031Migration1773700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const classroomIdMeta = await this.getColumnMeta(queryRunner, 'classrooms', 'id');
    const campusesIdMeta = await this.getColumnMeta(queryRunner, 'campuses', 'id');
    if (!classroomIdMeta || !campusesIdMeta) {
      throw new Error('No se encontro metadata de classrooms.id o campuses.id');
    }

    const hasPavilions = await this.tableExists(queryRunner, 'pavilions');
    if (!hasPavilions) {
      const tableCollation = await this.getTableCollation(queryRunner, 'classrooms');
      await queryRunner.query(`
        CREATE TABLE pavilions (
          id ${classroomIdMeta.columnType} NOT NULL PRIMARY KEY,
          campusId ${campusesIdMeta.columnType}${this.charsetCollationSql(
            campusesIdMeta.charsetName,
            campusesIdMeta.collationName
          )} NOT NULL,
          code VARCHAR(60) NOT NULL,
          name VARCHAR(120) NOT NULL,
          status ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          KEY idx_pavilions_campus_id (campusId),
          UNIQUE KEY uq_pavilions_campus_code (campusId, code),
          CONSTRAINT fk_pavilions_campus
            FOREIGN KEY (campusId) REFERENCES campuses(id)
            ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB${this.tableDefaultsSql(tableCollation)};
      `);
    }

    await this.addColumnIfMissing(
      queryRunner,
      'classrooms',
      'pavilionId',
      `${classroomIdMeta.columnType}${this.charsetCollationSql(
        classroomIdMeta.charsetName,
        classroomIdMeta.collationName
      )} NULL AFTER campusId`
    );

    await this.alignPavilionsPrimaryKeyToClassroomsId(queryRunner, classroomIdMeta);
    await this.alignClassroomsPavilionIdToClassroomsId(queryRunner, classroomIdMeta);

    await this.addColumnIfMissing(
      queryRunner,
      'classrooms',
      'levelName',
      'VARCHAR(80) NULL AFTER capacity'
    );

    await this.dropIndexIfExists(queryRunner, 'classrooms', 'uq_classrooms_campus_code');
    await this.dropIndexIfExists(queryRunner, 'classrooms', 'uq_classrooms_campusid_code');
    await this.dropIndexIfExists(queryRunner, 'classrooms', 'uq_classrooms_campus_pavilion_code');

    await this.addIndexIfMissing(
      queryRunner,
      'classrooms',
      'idx_classrooms_pavilion_id',
      'CREATE INDEX idx_classrooms_pavilion_id ON classrooms (pavilionId)'
    );

    await this.addForeignKeyIfMissing(
      queryRunner,
      'classrooms',
      'fk_classrooms_pavilion',
      `
      ALTER TABLE classrooms
      ADD CONSTRAINT fk_classrooms_pavilion
      FOREIGN KEY (pavilionId) REFERENCES pavilions(id)
      ON DELETE SET NULL ON UPDATE CASCADE
      `
    );

    await this.addIndexIfMissing(
      queryRunner,
      'classrooms',
      'uq_classrooms_campus_pavilion_code',
      'CREATE UNIQUE INDEX uq_classrooms_campus_pavilion_code ON classrooms (campusId, pavilionId, code)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfExists(
      queryRunner,
      'classrooms',
      'uq_classrooms_campus_pavilion_code'
    );
    await this.dropForeignKeyIfExists(
      queryRunner,
      'classrooms',
      'fk_classrooms_pavilion'
    );
    await this.dropIndexIfExists(queryRunner, 'classrooms', 'idx_classrooms_pavilion_id');
    await this.dropColumnIfExists(queryRunner, 'classrooms', 'levelName');
    await this.dropColumnIfExists(queryRunner, 'classrooms', 'pavilionId');

    await this.dropTableIfExists(queryRunner, 'pavilions');

    const hasCampusId = await this.columnExists(queryRunner, 'classrooms', 'campusId');
    if (hasCampusId) {
      await this.addIndexIfMissing(
        queryRunner,
        'classrooms',
        'uq_classrooms_campusid_code',
        'CREATE UNIQUE INDEX uq_classrooms_campusid_code ON classrooms (campusId, code)'
      );
    }
  }

  private async tableExists(queryRunner: QueryRunner, tableName: string) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      `,
      [tableName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async columnExists(
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

  private async getTableCollation(queryRunner: QueryRunner, tableName: string) {
    const rows: Array<{ tableCollation: string | null }> = await queryRunner.query(
      `
      SELECT TABLE_COLLATION AS tableCollation
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
      `,
      [tableName]
    );
    return String(rows[0]?.tableCollation ?? '').trim() || null;
  }

  private async getColumnMeta(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string
  ) {
    const rows: Array<{
      columnType: string;
      charsetName: string | null;
      collationName: string | null;
    }> = await queryRunner.query(
      `
      SELECT
        COLUMN_TYPE AS columnType,
        CHARACTER_SET_NAME AS charsetName,
        COLLATION_NAME AS collationName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    const row = rows[0];
    if (!row?.columnType) return null;
    return {
      columnType: String(row.columnType),
      charsetName: row.charsetName ? String(row.charsetName) : null,
      collationName: row.collationName ? String(row.collationName) : null,
    };
  }

  private charsetCollationSql(
    _charsetName: string | null,
    _collationName: string | null
  ) {
    return '';
  }

  private tableDefaultsSql(collationName: string | null) {
    if (!collationName) return '';
    const charset = collationName.split('_')[0];
    return ` DEFAULT CHARSET=${charset} COLLATE=${collationName}`;
  }

  private async alignPavilionsPrimaryKeyToClassroomsId(
    queryRunner: QueryRunner,
    idMeta: {
      columnType: string;
      charsetName: string | null;
      collationName: string | null;
    }
  ) {
    const pavilionsIdMeta = await this.getColumnMeta(queryRunner, 'pavilions', 'id');
    if (!pavilionsIdMeta) return;
    await queryRunner.query(
      `
      ALTER TABLE pavilions
      MODIFY COLUMN id ${idMeta.columnType}${this.charsetCollationSql(
        idMeta.charsetName,
        idMeta.collationName
      )} NOT NULL
      `
    );
  }

  private async alignClassroomsPavilionIdToClassroomsId(
    queryRunner: QueryRunner,
    idMeta: {
      columnType: string;
      charsetName: string | null;
      collationName: string | null;
    }
  ) {
    const pavilionIdMeta = await this.getColumnMeta(
      queryRunner,
      'classrooms',
      'pavilionId'
    );
    if (!pavilionIdMeta) return;
    await queryRunner.query(
      `
      ALTER TABLE classrooms
      MODIFY COLUMN pavilionId ${idMeta.columnType}${this.charsetCollationSql(
        idMeta.charsetName,
        idMeta.collationName
      )} NULL
      `
    );
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnSql: string
  ) {
    if (await this.columnExists(queryRunner, tableName, columnName)) return;
    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql};`);
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string
  ) {
    if (!(await this.columnExists(queryRunner, tableName, columnName))) return;
    await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName};`);
  }

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    createSql: string
  ) {
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
    if (Number(rows[0]?.c ?? 0) > 0) return;
    await queryRunner.query(createSql);
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string
  ) {
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
    if (Number(rows[0]?.c ?? 0) === 0) return;
    await queryRunner.query(`DROP INDEX ${indexName} ON ${tableName}`);
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    keyName: string,
    addSql: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      `,
      [tableName, keyName]
    );
    if (Number(rows[0]?.c ?? 0) > 0) return;
    await queryRunner.query(addSql);
  }

  private async dropForeignKeyIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    keyName: string
  ) {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      `,
      [tableName, keyName]
    );
    if (Number(rows[0]?.c ?? 0) === 0) return;
    await queryRunner.query(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${keyName}`);
  }

  private async dropTableIfExists(queryRunner: QueryRunner, tableName: string) {
    if (!(await this.tableExists(queryRunner, tableName))) return;
    await queryRunner.query(`DROP TABLE ${tableName}`);
  }
}
