import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { PeriodsService } from '../periods/periods.service';

type WorkshopMode = 'BY_SIZE' | 'SINGLE';
type SelectionMode = 'ALL' | 'MANUAL';
type DeliveryMode = 'VIRTUAL' | 'PRESENCIAL';

@Injectable()
export class WorkshopsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly periodsService: PeriodsService
  ) { }

  private normalize(value: string | null | undefined) {
    return String(value ?? '').trim();
  }

  private normalizeArray(value: string | string[] | null | undefined) {
    const arr = Array.isArray(value) ? value : [value];
    return arr
      .map((v) => this.normalize(v))
      .filter((v) => v.length > 0);
  }

  async list() {
    const rows = await this.dataSource.query(
      `
      SELECT *
      FROM workshops
      ORDER BY createdAt DESC
      `
    );
    return rows.map((r: any) => this.mapWorkshop(r));
  }

  async get(id: string) {
    const row = await this.dataSource
      .query(`SELECT * FROM workshops WHERE id = ? LIMIT 1`, [id])
      .then((r) => r[0]);
    if (!row) throw new NotFoundException('Taller no encontrado');
    const workshop = this.mapWorkshop(row) as ReturnType<WorkshopsService['mapWorkshop']> & { studentIds?: string[] };
    workshop.studentIds = await this.loadStudentIds(id);
    return workshop;
  }

  async create(payload: {
    name: string;
    mode: WorkshopMode;
    groupSize?: number | null;
    selectionMode: SelectionMode;
    facultyGroups?: string[] | null;
    campusNames?: string[] | null;
    careerNames?: string[] | null;
    facultyGroup?: string | null;
    campusName?: string | null;
    careerName?: string | null;
    deliveryMode?: DeliveryMode;
    venueCampusName?: string | null;
    studentIds?: string[];
  }) {
    this.validatePayload(payload);
    const id = randomUUID();
    const facultyGroups = this.normalizeArray(payload.facultyGroups ?? payload.facultyGroup);
    const campusNames = this.normalizeArray(payload.campusNames ?? payload.campusName);
    const careerNames = this.normalizeArray(payload.careerNames ?? payload.careerName);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        INSERT INTO workshops (
          id, name, mode, groupSize, selectionMode,
          facultyGroup, campusName, careerName,
          facultyGroups, campusNames, careerNames,
          deliveryMode, venueCampusName,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
        `,
        [
          id,
          payload.name,
          payload.mode,
          payload.mode === 'BY_SIZE' ? Number(payload.groupSize) : null,
          payload.selectionMode,
          (facultyGroups[0] ?? this.normalize(payload.facultyGroup)) || null,
          (campusNames[0] ?? this.normalize(payload.campusName)) || null,
          (careerNames[0] ?? this.normalize(payload.careerName)) || null,
          facultyGroups.length > 0 ? JSON.stringify(facultyGroups) : null,
          campusNames.length > 0 ? JSON.stringify(campusNames) : null,
          careerNames.length > 0 ? JSON.stringify(careerNames) : null,
          payload.deliveryMode ?? 'VIRTUAL',
          this.normalize(payload.venueCampusName) || null,
        ]
      );
      if (payload.selectionMode === 'MANUAL') {
        await this.saveStudentIds(manager, id, payload.studentIds ?? []);
      }
    });
    return this.get(id);
  }

  async update(id: string, payload: Partial<{
    name: string;
    mode: WorkshopMode;
    groupSize?: number | null;
    selectionMode: SelectionMode;
    facultyGroups?: string[] | null;
    campusNames?: string[] | null;
    careerNames?: string[] | null;
    facultyGroup?: string | null;
    campusName?: string | null;
    careerName?: string | null;
    deliveryMode?: DeliveryMode;
    venueCampusName?: string | null;
    studentIds?: string[];
  }>) {
    const existing = await this.get(id);
    const merged = { ...existing, ...payload };
    this.validatePayload(merged as any);
    const facultyGroups = this.normalizeArray((payload as any).facultyGroups ?? merged.facultyGroups ?? merged.facultyGroup);
    const campusNames = this.normalizeArray((payload as any).campusNames ?? merged.campusNames ?? merged.campusName);
    const careerNames = this.normalizeArray((payload as any).careerNames ?? merged.careerNames ?? merged.careerName);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE workshops SET
          name = ?, mode = ?, groupSize = ?, selectionMode = ?,
          facultyGroup = ?, campusName = ?, careerName = ?,
          facultyGroups = ?, campusNames = ?, careerNames = ?,
          deliveryMode = ?, venueCampusName = ?, updatedAt = NOW(6)
        WHERE id = ?
        `,
        [
          merged.name,
          merged.mode,
          merged.mode === 'BY_SIZE' ? Number(merged.groupSize) : null,
          merged.selectionMode,
          (facultyGroups[0] ?? this.normalize(merged.facultyGroup)) || null,
          (campusNames[0] ?? this.normalize(merged.campusName)) || null,
          (careerNames[0] ?? this.normalize(merged.careerName)) || null,
          facultyGroups.length > 0 ? JSON.stringify(facultyGroups) : null,
          campusNames.length > 0 ? JSON.stringify(campusNames) : null,
          careerNames.length > 0 ? JSON.stringify(careerNames) : null,
          merged.deliveryMode ?? 'VIRTUAL',
          this.normalize(merged.venueCampusName) || null,
          id,
        ]
      );
      await manager.query(`DELETE FROM workshop_students WHERE workshopId = ?`, [id]);
      if (merged.selectionMode === 'MANUAL') {
        await this.saveStudentIds(manager, id, merged.studentIds ?? []);
      }
    });
    return this.get(id);
  }

  async delete(id: string) {
    await this.dataSource.query(`DELETE FROM workshops WHERE id = ?`, [id]);
    return { ok: true };
  }

  private async loadStudentIds(workshopId: string) {
    const rows = await this.dataSource.query(
      `SELECT studentId FROM workshop_students WHERE workshopId = ?`,
      [workshopId]
    );
    return rows.map((r: any) => String(r.studentId));
  }

  private async saveStudentIds(manager: any, workshopId: string, studentIds: string[]) {
    if (!studentIds || studentIds.length === 0) {
      throw new BadRequestException('Seleccion manual vacia');
    }
    const unique = Array.from(new Set(studentIds.map((x) => String(x))));
    const values = unique.map((id) => [randomUUID(), workshopId, id]);
    if (values.length > 0) {
      const placeholders = values.map(() => '(?, ?, ?)').join(', ');
      await manager.query(
        `INSERT INTO workshop_students (id, workshopId, studentId, createdAt) VALUES ${placeholders}`,
        values.flat()
      );
    }
  }

  private validatePayload(payload: {
    name: string;
    mode: WorkshopMode;
    groupSize?: number | null;
    selectionMode: SelectionMode;
    studentIds?: string[];
  }) {
    const name = this.normalize(payload.name);
    if (!name) throw new BadRequestException('El nombre del taller es requerido');
    const mode = (payload.mode || 'BY_SIZE').toUpperCase() as WorkshopMode;
    if (mode === 'BY_SIZE') {
      const size = Number(payload.groupSize ?? 0);
      if (!Number.isFinite(size) || size <= 0) {
        throw new BadRequestException('El tamaño de grupo debe ser mayor a 0');
      }
    }
    const selectionMode = (payload.selectionMode || 'ALL').toUpperCase() as SelectionMode;
    if (selectionMode === 'MANUAL') {
      if (!payload.studentIds || payload.studentIds.length === 0) {
        throw new BadRequestException('Debes seleccionar al menos un alumno en modo manual');
      }
    }
  }

  async listStudents(filters: {
    facultyGroup?: string | string[];
    campusName?: string | string[];
    careerName?: string | string[];
  }) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const conditions: string[] = ['sc.periodId = ?'];
    const params: any[] = [periodId];
    const faculties = this.normalizeArray(filters.facultyGroup);
    const campuses = this.normalizeArray(filters.campusName);
    const careers = this.normalizeArray(filters.careerName);

    if (faculties.length === 1) {
      conditions.push('s.facultyGroup = ?');
      params.push(faculties[0]);
    } else if (faculties.length > 1) {
      conditions.push(`s.facultyGroup IN (${faculties.map(() => '?').join(', ')})`);
      params.push(...faculties);
    }

    if (campuses.length === 1) {
      conditions.push('s.campusName = ?');
      params.push(campuses[0]);
    } else if (campuses.length > 1) {
      conditions.push(`s.campusName IN (${campuses.map(() => '?').join(', ')})`);
      params.push(...campuses);
    }

    if (careers.length === 1) {
      conditions.push('u.careerName = ?');
      params.push(careers[0]);
    } else if (careers.length > 1) {
      conditions.push(`u.careerName IN (${careers.map(() => '?').join(', ')})`);
      params.push(...careers);
    }
    const sql = `
      SELECT DISTINCT
        u.id AS studentId,
        u.dni,
        u.codigoAlumno,
        u.fullName,
        u.careerName,
        s.facultyGroup,
        s.campusName
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN users u ON u.id = ssc.studentId
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.fullName ASC
    `;
    return this.dataSource.query(sql, params);
  }

  async listFilters(filters: { facultyGroup?: string | string[]; campusName?: string | string[] }) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const faculties = await this.dataSource
      .query(
        `
        SELECT DISTINCT s.facultyGroup AS value
        FROM section_courses sc
        INNER JOIN sections s ON s.id = sc.sectionId
        WHERE sc.periodId = ?
          AND s.facultyGroup IS NOT NULL AND s.facultyGroup <> ''
        ORDER BY value ASC
        `,
        [periodId]
      )
      .then((rows: any[]) => rows.map((r) => String(r.value)));

    const campusConds = ['sc.periodId = ?', 's.campusName IS NOT NULL', "s.campusName <> ''"];
    const campusParams: any[] = [periodId];
    const facs = this.normalizeArray(filters.facultyGroup);
    if (facs.length > 0) {
      campusConds.push(`s.facultyGroup IN (${facs.map(() => '?').join(', ')})`);
      campusParams.push(...facs);
    }
    const campuses = await this.dataSource
      .query(
        `
        SELECT DISTINCT s.campusName AS value
        FROM section_courses sc
        INNER JOIN sections s ON s.id = sc.sectionId
        WHERE ${campusConds.join(' AND ')}
        ORDER BY value ASC
        `,
        campusParams
      )
      .then((rows: any[]) => rows.map((r) => String(r.value)));

    const careerConds = ['sc.periodId = ?', 'u.careerName IS NOT NULL', "u.careerName <> ''"];
    const careerParams: any[] = [periodId];
    const camps = this.normalizeArray(filters.campusName);
    if (facs.length > 0) {
      careerConds.push(`s.facultyGroup IN (${facs.map(() => '?').join(', ')})`);
      careerParams.push(...facs);
    }
    if (camps.length > 0) {
      careerConds.push(`s.campusName IN (${camps.map(() => '?').join(', ')})`);
      careerParams.push(...camps);
    }
    const careers = await this.dataSource
      .query(
        `
        SELECT DISTINCT u.careerName AS value
        FROM section_student_courses ssc
        INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
        INNER JOIN sections s ON s.id = sc.sectionId
        INNER JOIN users u ON u.id = ssc.studentId
        WHERE ${careerConds.join(' AND ')}
        ORDER BY value ASC
        `,
        careerParams
      )
      .then((rows: any[]) => rows.map((r) => String(r.value)));

    return {
      faculties,
      campuses,
      careers,
    };
  }

  async preview(workshopId: string) {
    const workshop = await this.get(workshopId);
    const students = await this.loadStudentsForWorkshop(workshop);
    const groups = this.buildGroups(workshop, students.length);
    return {
      workshop,
      totalStudents: students.length,
      groups,
    };
  }

  async apply(workshopId: string) {
    // Placeholder: In a full implementation this would write to staging demand tables.
    const preview = await this.preview(workshopId);
    return { ok: true, ...preview };
  }

  private async loadStudentsForWorkshop(workshop: any) {
    if (workshop.selectionMode === 'MANUAL') {
      const ids = await this.loadStudentIds(workshop.id);
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      return this.dataSource.query(
        `
        SELECT id AS studentId, dni, codigoAlumno, fullName, careerName, NULL AS facultyGroup, NULL AS campusName
        FROM users
        WHERE id IN (${placeholders})
        ORDER BY fullName ASC
        `,
        ids
      );
    }
    return this.listStudents({
      facultyGroup: (workshop as any).facultyGroups?.length ? (workshop as any).facultyGroups : workshop.facultyGroup ?? undefined,
      campusName: (workshop as any).campusNames?.length ? (workshop as any).campusNames : workshop.campusName ?? undefined,
      careerName: (workshop as any).careerNames?.length ? (workshop as any).careerNames : workshop.careerName ?? undefined,
    });
  }

  private buildGroups(workshop: any, studentCount: number) {
    if (studentCount <= 0) return [];
    if (workshop.mode === 'SINGLE') {
      return [{ index: 1, size: studentCount }];
    }
    const size = Math.max(1, Number(workshop.groupSize ?? 1));
    const groups: Array<{ index: number; size: number }> = [];
    let remaining = studentCount;
    let idx = 1;
    while (remaining > 0) {
      const take = Math.min(size, remaining);
      groups.push({ index: idx++, size: take });
      remaining -= take;
    }
    return groups;
  }

  private mapWorkshop(row: any) {
    const parseJsonArray = (value: any) => {
      try {
        const parsed = JSON.parse(value ?? '[]');
        return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
      } catch {
        return [];
      }
    };
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      mode: (row.mode || 'BY_SIZE') as WorkshopMode,
      groupSize: row.groupSize !== null && row.groupSize !== undefined ? Number(row.groupSize) : null,
      selectionMode: (row.selectionMode || 'ALL') as SelectionMode,
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      careerName: row.careerName ? String(row.careerName) : null,
      facultyGroups: parseJsonArray(row.facultyGroups),
      campusNames: parseJsonArray(row.campusNames),
      careerNames: parseJsonArray(row.careerNames),
      deliveryMode: (row.deliveryMode || 'VIRTUAL') as DeliveryMode,
      venueCampusName: row.venueCampusName ? String(row.venueCampusName) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
