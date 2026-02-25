import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassroomsCampusRelation030Migration1773600000000
  implements MigrationInterface
{
  name = 'ClassroomsCampusRelation030Migration1773600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const campusesIdMeta = await this.getColumnMeta(queryRunner, 'campuses', 'id');
    const campusesNameMeta = await this.getColumnMeta(queryRunner, 'campuses', 'name');
    const classroomsCampusNameMeta = await this.getColumnMeta(
      queryRunner,
      'classrooms',
      'campusName'
    );
    if (!campusesIdMeta) {
      throw new Error('No se encontro metadata de campuses.id');
    }
    const compareCollation = this.resolveCompareCollation(
      campusesNameMeta?.collationName,
      classroomsCampusNameMeta?.collationName
    );

    await this.addColumnIfMissing(
      queryRunner,
      'classrooms',
      'campusId',
      `${campusesIdMeta.columnType}${this.charsetCollationSql(
        campusesIdMeta.charsetName,
        campusesIdMeta.collationName
      )} NULL AFTER id`
    );

    await queryRunner.query(`
      UPDATE classrooms cl
      LEFT JOIN campuses cp
        ON UPPER(TRIM(cp.name)) COLLATE ${compareCollation}
         = UPPER(TRIM(cl.campusName)) COLLATE ${compareCollation}
      SET cl.campusId = cp.id
      WHERE cl.campusId IS NULL
    `);

    await this.addIndexIfMissing(
      queryRunner,
      'classrooms',
      'idx_classrooms_campus_id',
      'CREATE INDEX idx_classrooms_campus_id ON classrooms (campusId)'
    );

    await this.addForeignKeyIfMissing(
      queryRunner,
      'classrooms',
      'fk_classrooms_campus',
      `
      ALTER TABLE classrooms
      ADD CONSTRAINT fk_classrooms_campus
      FOREIGN KEY (campusId) REFERENCES campuses(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
      `
    );

    await this.addUniqueIfMissing(
      queryRunner,
      'classrooms',
      'uq_classrooms_campusid_code',
      'CREATE UNIQUE INDEX uq_classrooms_campusid_code ON classrooms (campusId, code)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfExists(
      queryRunner,
      'classrooms',
      'uq_classrooms_campusid_code'
    );
    await this.dropForeignKeyIfExists(
      queryRunner,
      'classrooms',
      'fk_classrooms_campus'
    );
    await this.dropIndexIfExists(
      queryRunner,
      'classrooms',
      'idx_classrooms_campus_id'
    );
    await this.dropColumnIfExists(queryRunner, 'classrooms', 'campusId');
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
    charsetName: string | null,
    collationName: string | null
  ) {
    if (!charsetName || !collationName) return '';
    return ` CHARACTER SET ${charsetName} COLLATE ${collationName}`;
  }

  private resolveCompareCollation(...candidates: Array<string | null | undefined>) {
    for (const raw of candidates) {
      const c = String(raw ?? '').trim();
      if (!c) continue;
      if (/^[a-zA-Z0-9_]+$/.test(c)) return c;
    }
    return 'utf8mb4_unicode_ci';
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnSql: string
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
    if (Number(rows[0]?.c ?? 0) > 0) return;
    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql};`);
  }

  private async dropColumnIfExists(
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
    if (Number(rows[0]?.c ?? 0) === 0) return;
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

  private async addUniqueIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    createSql: string
  ) {
    await this.addIndexIfMissing(queryRunner, tableName, indexName, createSql);
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
}
