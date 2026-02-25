import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from './classroom.entity';
import { PavilionEntity } from './pavilion.entity';

@Injectable()
export class ClassroomsService {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomsRepo: Repository<ClassroomEntity>,
    @InjectRepository(PavilionEntity)
    private readonly pavilionsRepo: Repository<PavilionEntity>
  ) {}

  async list(params?: {
    campusId?: string;
    campusName?: string;
    pavilionId?: string;
    status?: string;
  }) {
    const campusId = String(params?.campusId ?? '').trim();
    const campusName = String(params?.campusName ?? '').trim();
    const pavilionId = String(params?.pavilionId ?? '').trim();
    const status = String(params?.status ?? '').trim().toUpperCase();

    const qb = this.classroomsRepo
      .createQueryBuilder('c')
      .leftJoin('pavilions', 'p', 'p.id = c.pavilionId')
      .select([
        'c.id AS id',
        'c.campusId AS campusId',
        'c.campusName AS campusName',
        'c.pavilionId AS pavilionId',
        'p.code AS pavilionCode',
        'p.name AS pavilionName',
        'c.code AS code',
        'c.name AS name',
        'c.capacity AS capacity',
        'c.levelName AS levelName',
        'c.type AS type',
        'c.status AS status',
        'c.notes AS notes',
        'c.createdAt AS createdAt',
        'c.updatedAt AS updatedAt',
      ]);

    if (campusId) {
      qb.andWhere('c.campusId = :campusId', { campusId });
    }
    if (campusName) {
      qb.andWhere("UPPER(TRIM(COALESCE(c.campusName, ''))) = :campusName", {
        campusName: this.norm(campusName),
      });
    }
    if (pavilionId) {
      qb.andWhere('c.pavilionId = :pavilionId', { pavilionId });
    }
    if (status && status !== 'ALL') {
      qb.andWhere('c.status = :status', { status });
    }

    qb.orderBy('c.campusName', 'ASC')
      .addOrderBy('p.code', 'ASC')
      .addOrderBy('c.levelName', 'ASC')
      .addOrderBy('c.code', 'ASC')
      .addOrderBy('c.name', 'ASC');

    const rows = await qb.getRawMany<{
      id: string;
      campusId: string | null;
      campusName: string;
      pavilionId: string | null;
      pavilionCode: string | null;
      pavilionName: string | null;
      code: string;
      name: string;
      capacity: number;
      levelName: string | null;
      type: 'AULA' | 'LABORATORIO' | 'AUDITORIO';
      status: 'ACTIVA' | 'INACTIVA';
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>();

    return rows.map((row) => ({
      id: String(row.id),
      campusId: row.campusId ? String(row.campusId) : null,
      campusName: String(row.campusName ?? '').trim(),
      pavilionId: row.pavilionId ? String(row.pavilionId) : null,
      pavilionCode: row.pavilionCode ? String(row.pavilionCode) : null,
      pavilionName: row.pavilionName ? String(row.pavilionName) : null,
      code: String(row.code ?? '').trim(),
      name: String(row.name ?? '').trim(),
      capacity: Number(row.capacity ?? 0),
      levelName: row.levelName ? String(row.levelName) : null,
      type: row.type,
      status: row.status,
      notes: row.notes ? String(row.notes) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listCampuses() {
    const rows: Array<{ id: string; name: string }> =
      await this.classroomsRepo.manager.query(
        `
        SELECT id, name
        FROM campuses
        ORDER BY name ASC
        `
      );
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? '').trim(),
    }));
  }

  async listPavilions(params?: { campusId?: string; status?: string }) {
    const campusId = String(params?.campusId ?? '').trim();
    const status = String(params?.status ?? '').trim().toUpperCase();

    const qb = this.pavilionsRepo
      .createQueryBuilder('p')
      .innerJoin('campuses', 'cp', 'cp.id = p.campusId')
      .select([
        'p.id AS id',
        'p.campusId AS campusId',
        'cp.name AS campusName',
        'p.code AS code',
        'p.name AS name',
        'p.status AS status',
        'p.createdAt AS createdAt',
        'p.updatedAt AS updatedAt',
      ]);

    if (campusId) {
      qb.andWhere('p.campusId = :campusId', { campusId });
    }
    if (status && status !== 'ALL') {
      qb.andWhere('p.status = :status', { status });
    }

    qb.orderBy('cp.name', 'ASC').addOrderBy('p.code', 'ASC').addOrderBy('p.name', 'ASC');

    const rows = await qb.getRawMany<{
      id: string;
      campusId: string;
      campusName: string;
      code: string;
      name: string;
      status: 'ACTIVO' | 'INACTIVO';
      createdAt: Date;
      updatedAt: Date;
    }>();

    return rows.map((row) => ({
      id: String(row.id),
      campusId: String(row.campusId),
      campusName: String(row.campusName ?? '').trim(),
      code: String(row.code ?? '').trim(),
      name: String(row.name ?? '').trim(),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async createPavilion(params: {
    campusId: string;
    code: string;
    name: string;
    status?: 'ACTIVO' | 'INACTIVO';
  }) {
    const campusId = String(params.campusId ?? '').trim();
    const code = String(params.code ?? '').trim().toUpperCase();
    const name = String(params.name ?? '').trim();
    if (!campusId || !code || !name) {
      throw new BadRequestException('campusId, code y name son requeridos');
    }

    await this.getCampusByIdOrThrow(campusId);
    await this.assertUniquePavilionCode(campusId, code);

    const created = this.pavilionsRepo.create({
      campusId,
      code,
      name,
      status: params.status ?? 'ACTIVO',
    });
    return this.pavilionsRepo.save(created);
  }

  async updatePavilion(
    id: string,
    params: {
      campusId?: string;
      code?: string;
      name?: string;
      status?: 'ACTIVO' | 'INACTIVO';
    }
  ) {
    const pavilion = await this.getPavilionByIdOrThrow(id);

    const nextCampusId =
      params.campusId !== undefined
        ? String(params.campusId ?? '').trim()
        : String(pavilion.campusId ?? '').trim();
    const nextCode =
      params.code !== undefined
        ? String(params.code ?? '').trim().toUpperCase()
        : String(pavilion.code ?? '').trim().toUpperCase();
    const nextName =
      params.name !== undefined ? String(params.name ?? '').trim() : String(pavilion.name ?? '').trim();

    if (!nextCampusId || !nextCode || !nextName) {
      throw new BadRequestException('campusId, code y name son requeridos');
    }

    await this.getCampusByIdOrThrow(nextCampusId);
    await this.assertUniquePavilionCode(nextCampusId, nextCode, pavilion.id);

    if (params.status === 'INACTIVO' && pavilion.status !== 'INACTIVO') {
      await this.assertPavilionNotUsedInActivePeriod(pavilion.id);
    }

    pavilion.campusId = nextCampusId;
    pavilion.code = nextCode;
    pavilion.name = nextName;
    if (params.status !== undefined) {
      pavilion.status = params.status;
    }

    return this.pavilionsRepo.save(pavilion);
  }

  async updatePavilionStatus(id: string, status: 'ACTIVO' | 'INACTIVO') {
    const pavilion = await this.getPavilionByIdOrThrow(id);
    if (status === 'INACTIVO' && pavilion.status !== 'INACTIVO') {
      await this.assertPavilionNotUsedInActivePeriod(id);
    }
    pavilion.status = status;
    return this.pavilionsRepo.save(pavilion);
  }

  async removePavilion(id: string) {
    const pavilion = await this.getPavilionByIdOrThrow(id);

    const inUseRows: Array<{ c: number }> = await this.pavilionsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM classrooms
      WHERE pavilionId = ?
      `,
      [pavilion.id]
    );

    if (Number(inUseRows[0]?.c ?? 0) > 0) {
      throw new ConflictException('No se puede eliminar un pabellon que tiene aulas asociadas');
    }

    await this.pavilionsRepo.remove(pavilion);
    return { ok: true };
  }

  async create(params: {
    campusId: string;
    pavilionId: string;
    code: string;
    name: string;
    capacity: number;
    levelName: string;
    type?: 'AULA' | 'LABORATORIO' | 'AUDITORIO';
    status?: 'ACTIVA' | 'INACTIVA';
    notes?: string | null;
  }) {
    const campusId = String(params.campusId ?? '').trim();
    const pavilionId = String(params.pavilionId ?? '').trim();
    const code = String(params.code ?? '').trim().toUpperCase();
    const name = String(params.name ?? '').trim();
    const capacity = Math.max(1, Number(params.capacity ?? 1));
    const levelName = String(params.levelName ?? '').trim();

    if (!campusId || !pavilionId || !code || !name || !levelName) {
      throw new BadRequestException(
        'campusId, pavilionId, code, name y levelName son requeridos'
      );
    }

    const campus = await this.getCampusByIdOrThrow(campusId);
    await this.getPavilionByIdOrThrow(pavilionId, {
      campusId,
      requireActive: true,
    });

    await this.assertUniqueCampusPavilionCode(campusId, pavilionId, code);

    const created = this.classroomsRepo.create({
      campusId,
      campusName: campus.name,
      pavilionId,
      code,
      name,
      capacity,
      levelName,
      type: params.type ?? 'AULA',
      status: params.status ?? 'ACTIVA',
      notes: String(params.notes ?? '').trim() || null,
    });
    return this.classroomsRepo.save(created);
  }

  async update(
    id: string,
    params: {
      campusId?: string;
      pavilionId?: string;
      code?: string;
      name?: string;
      capacity?: number;
      levelName?: string;
      type?: 'AULA' | 'LABORATORIO' | 'AUDITORIO';
      status?: 'ACTIVA' | 'INACTIVA';
      notes?: string | null;
    }
  ) {
    const classroom = await this.getByIdOrThrow(id);

    const nextCampusId =
      params.campusId !== undefined
        ? String(params.campusId).trim()
        : String(classroom.campusId ?? '').trim();
    const nextPavilionId =
      params.pavilionId !== undefined
        ? String(params.pavilionId).trim()
        : String(classroom.pavilionId ?? '').trim();
    const nextCode =
      params.code !== undefined
        ? String(params.code).trim().toUpperCase()
        : classroom.code;
    const nextName =
      params.name !== undefined ? String(params.name).trim() : classroom.name;
    const nextCapacity =
      params.capacity !== undefined
        ? Math.max(1, Number(params.capacity ?? 1))
        : classroom.capacity;
    const nextLevelName =
      params.levelName !== undefined
        ? String(params.levelName ?? '').trim()
        : String(classroom.levelName ?? '').trim();

    if (!nextCampusId || !nextPavilionId || !nextCode || !nextName || !nextLevelName) {
      throw new BadRequestException(
        'campusId, pavilionId, code, name y levelName son requeridos'
      );
    }

    const campus = await this.getCampusByIdOrThrow(nextCampusId);
    await this.getPavilionByIdOrThrow(nextPavilionId, {
      campusId: nextCampusId,
      requireActive: true,
    });

    await this.assertUniqueCampusPavilionCode(
      nextCampusId,
      nextPavilionId,
      nextCode,
      classroom.id
    );
    await this.assertCapacityCanFitAssigned(classroom.id, nextCapacity);

    classroom.campusId = nextCampusId;
    classroom.campusName = campus.name;
    classroom.pavilionId = nextPavilionId;
    classroom.code = nextCode;
    classroom.name = nextName;
    classroom.capacity = nextCapacity;
    classroom.levelName = nextLevelName;

    if (params.type !== undefined) {
      classroom.type = params.type;
    }
    if (params.status !== undefined) {
      classroom.status = params.status;
    }
    if (params.notes !== undefined) {
      classroom.notes = String(params.notes ?? '').trim() || null;
    }

    return this.classroomsRepo.save(classroom);
  }

  async updateStatus(id: string, status: 'ACTIVA' | 'INACTIVA') {
    const classroom = await this.getByIdOrThrow(id);
    if (status === 'INACTIVA') {
      const inUseRows: Array<{ c: number }> = await this.classroomsRepo.manager.query(
        `
        SELECT COUNT(*) AS c
        FROM section_courses sc
        WHERE sc.classroomId = ?
          AND EXISTS (
            SELECT 1
            FROM periods p
            WHERE p.id = sc.periodId
              AND p.status = 'ACTIVE'
          )
        `,
        [classroom.id]
      );
      if (Number(inUseRows[0]?.c ?? 0) > 0) {
        throw new ConflictException(
          'No puedes inactivar un aula que esta asignada a secciones-curso del periodo activo'
        );
      }
    }
    classroom.status = status;
    return this.classroomsRepo.save(classroom);
  }

  async remove(id: string) {
    const classroom = await this.getByIdOrThrow(id);
    const inUseRows: Array<{ c: number }> = await this.classroomsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM section_courses
      WHERE classroomId = ?
      `,
      [classroom.id]
    );
    if (Number(inUseRows[0]?.c ?? 0) > 0) {
      throw new ConflictException('No se puede eliminar un aula en uso');
    }
    await this.classroomsRepo.remove(classroom);
    return { ok: true };
  }

  async getByIdOrThrow(id: string) {
    const classroom = await this.classroomsRepo.findOne({ where: { id } });
    if (!classroom) {
      throw new NotFoundException('Aula no encontrada');
    }
    return classroom;
  }

  private async assertUniqueCampusPavilionCode(
    campusId: string,
    pavilionId: string,
    code: string,
    excludeId?: string
  ) {
    const existing = await this.classroomsRepo.findOne({
      where: { campusId, pavilionId, code },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Ya existe un aula con el mismo codigo en esa sede y pabellon'
      );
    }
  }

  private async assertUniquePavilionCode(
    campusId: string,
    code: string,
    excludeId?: string
  ) {
    const existing = await this.pavilionsRepo.findOne({ where: { campusId, code } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Ya existe un pabellon con el mismo codigo en esa sede'
      );
    }
  }

  private async getCampusByIdOrThrow(campusId: string) {
    const rows: Array<{ id: string; name: string }> = await this.classroomsRepo.manager.query(
      `
      SELECT id, name
      FROM campuses
      WHERE id = ?
      LIMIT 1
      `,
      [campusId]
    );
    const row = rows[0];
    if (!row?.id) {
      throw new NotFoundException('Sede no encontrada');
    }
    return {
      id: String(row.id),
      name: String(row.name ?? '').trim(),
    };
  }

  private async getPavilionByIdOrThrow(
    pavilionId: string,
    opts?: {
      campusId?: string;
      requireActive?: boolean;
    }
  ) {
    const pavilion = await this.pavilionsRepo.findOne({ where: { id: pavilionId } });
    if (!pavilion) {
      throw new NotFoundException('Pabellon no encontrado');
    }

    const campusId = String(opts?.campusId ?? '').trim();
    if (campusId && String(pavilion.campusId ?? '').trim() !== campusId) {
      throw new BadRequestException('El pabellon debe pertenecer a la misma sede del aula');
    }

    if (opts?.requireActive && pavilion.status !== 'ACTIVO') {
      throw new BadRequestException('Solo puedes usar pabellones activos');
    }

    return pavilion;
  }

  private async assertPavilionNotUsedInActivePeriod(pavilionId: string) {
    const rows: Array<{ c: number }> = await this.classroomsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM section_courses sc
      INNER JOIN classrooms cl ON cl.id = sc.classroomId
      WHERE cl.pavilionId = ?
        AND EXISTS (
          SELECT 1
          FROM periods p
          WHERE p.id = sc.periodId
            AND p.status = 'ACTIVE'
        )
      `,
      [pavilionId]
    );
    if (Number(rows[0]?.c ?? 0) > 0) {
      throw new ConflictException(
        'No puedes inactivar un pabellon con aulas asignadas a secciones-curso del periodo activo'
      );
    }
  }

  private async assertCapacityCanFitAssigned(classroomId: string, nextCapacity: number) {
    const rows: Array<{ maxAssigned: number }> = await this.classroomsRepo.manager.query(
      `
      SELECT COALESCE(MAX(z.assigned), 0) AS maxAssigned
      FROM (
        SELECT
          sc.id AS sectionCourseId,
          COUNT(ssc.studentId) AS assigned
        FROM section_courses sc
        LEFT JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
        WHERE sc.classroomId = ?
        GROUP BY sc.id
      ) z
      `,
      [classroomId]
    );
    const maxAssigned = Number(rows[0]?.maxAssigned ?? 0);
    if (maxAssigned > nextCapacity) {
      throw new ConflictException(
        `No se puede reducir aforo del aula a ${nextCapacity}. Hay secciones-curso con ${maxAssigned} matriculados.`
      );
    }
  }

  private norm(value: string) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }
}
