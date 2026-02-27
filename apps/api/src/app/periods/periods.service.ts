import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AdminPeriodContextService } from '../common/context/admin-period-context.service';
import { EntityManager, Repository } from 'typeorm';
import { PeriodEntity } from './period.entity';

@Injectable()
export class PeriodsService {
  constructor(
    @InjectRepository(PeriodEntity)
    private readonly periodsRepo: Repository<PeriodEntity>,
    private readonly adminPeriodContext: AdminPeriodContextService
  ) { }

  async list() {
    return this.periodsRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async create(params: {
    code: string;
    name: string;
    kind?: 'NIVELACION' | 'REGULAR';
    startsAt?: string | null;
    endsAt?: string | null;
  }) {
    const code = String(params.code || '').trim();
    const name = String(params.name || '').trim();
    if (!code || !name) {
      throw new BadRequestException('code and name are required');
    }

    const exists = await this.periodsRepo.findOne({ where: { code } });
    if (exists) {
      throw new BadRequestException(`Period code already exists: ${code}`);
    }

    const active = await this.findActiveOrNull();
    const period = this.periodsRepo.create({
      code,
      name,
      kind: params.kind ?? 'NIVELACION',
      status: active ? 'PLANNED' : 'ACTIVE',
      startsAt: params.startsAt ?? null,
      endsAt: params.endsAt ?? null,
    });
    return this.periodsRepo.save(period);
  }

  async activate(id: string) {
    const target = await this.periodsRepo.findOne({ where: { id } });
    if (!target) throw new NotFoundException('Period not found');

    await this.periodsRepo
      .createQueryBuilder()
      .update(PeriodEntity)
      .set({ status: 'CLOSED' })
      .where('status = :status', { status: 'ACTIVE' })
      .execute();

    target.status = 'ACTIVE';
    return this.periodsRepo.save(target);
  }

  async update(
    id: string,
    params: {
      name?: string;
      startsAt?: string | null;
      endsAt?: string | null;
    }
  ) {
    const period = await this.periodsRepo.findOne({ where: { id } });
    if (!period) throw new NotFoundException('Period not found');

    const nextName =
      params.name === undefined ? period.name : String(params.name || '').trim();
    const nextStartsAt = params.startsAt === undefined ? period.startsAt : params.startsAt;
    const nextEndsAt = params.endsAt === undefined ? period.endsAt : params.endsAt;

    if (!nextName) {
      throw new BadRequestException('El nombre es obligatorio');
    }
    if (nextStartsAt && nextEndsAt && nextStartsAt > nextEndsAt) {
      throw new BadRequestException('La fecha de inicio no puede ser mayor a la fecha fin');
    }
    period.name = nextName;
    period.startsAt = nextStartsAt;
    period.endsAt = nextEndsAt;
    return this.periodsRepo.save(period);
  }

  async clearData(id: string) {
    const period = await this.periodsRepo.findOne({ where: { id } });
    if (!period) throw new NotFoundException('Period not found');

    await this.periodsRepo.manager.transaction(async (manager) => {
      await this.clearPeriodDataInTransaction(manager, id);
    });

    return { ok: true, periodDeleted: false };
  }

  async deletePeriod(id: string) {
    const period = await this.periodsRepo.findOne({ where: { id } });
    if (!period) throw new NotFoundException('Period not found');

    const replacementActive = period.status === 'ACTIVE'
      ? await this.periodsRepo.findOne({
        where: { status: 'CLOSED' },
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
      }) || await this.periodsRepo.findOne({
        where: { status: 'PLANNED' },
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
      })
      : null;

    if (period.status === 'ACTIVE' && !replacementActive) {
      throw new BadRequestException('No se puede borrar el unico periodo activo');
    }

    await this.periodsRepo.manager.transaction(async (manager) => {
      await this.clearPeriodDataInTransaction(manager, id);

      await manager.query(
        `
        DELETE FROM periods
        WHERE id = ?
        `,
        [id]
      );

      if (replacementActive) {
        await manager.query(
          `
          UPDATE periods
          SET status = 'ACTIVE'
          WHERE id = ?
          `,
          [replacementActive.id]
        );
      }
    });

    return {
      ok: true,
      periodDeleted: true,
      replacementActivePeriodId: replacementActive?.id ?? null,
    };
  }

  async getActivePeriodOrThrow() {
    const active = await this.findActiveOrNull();
    if (active) return active;
    throw new BadRequestException('No active period configured');
  }

  async getActivePeriodIdOrThrow() {
    const active = await this.getActivePeriodOrThrow();
    return active.id;
  }

  async getOperationalPeriodOrThrow() {
    const adminPeriodId = this.adminPeriodContext.getAdminPeriodId();
    if (adminPeriodId) {
      const period = await this.periodsRepo.findOne({ where: { id: adminPeriodId } });
      if (!period) {
        throw new BadRequestException('periodId de trabajo invalido');
      }
      return period;
    }
    return this.getActivePeriodOrThrow();
  }

  async getOperationalPeriodIdOrThrow() {
    const period = await this.getOperationalPeriodOrThrow();
    return period.id;
  }

  private async findActiveOrNull() {
    return this.periodsRepo.findOne({
      where: { status: 'ACTIVE' },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  private async clearPeriodDataInTransaction(manager: EntityManager, periodId: string) {
    await manager.query(
      `
      DELETE g
      FROM section_course_grades g
      INNER JOIN section_courses sc ON sc.id = g.sectionCourseId
      WHERE sc.periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE FROM section_course_grade_publications
      WHERE periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE gsc
      FROM grade_scheme_components gsc
      INNER JOIN grade_schemes gs ON gs.id = gsc.schemeId
      WHERE gs.periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE FROM grade_schemes
      WHERE periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE ssc
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      WHERE sc.periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE sct
      FROM section_course_teachers sct
      INNER JOIN section_courses sc ON sc.id = sct.sectionCourseId
      WHERE sc.periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE sb
      FROM schedule_blocks sb
      INNER JOIN section_courses sc ON sc.id = sb.sectionCourseId
      WHERE sc.periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE lrd
      FROM leveling_run_student_course_demands lrd
      INNER JOIN leveling_runs lr ON lr.id = lrd.runId
      WHERE lr.periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE FROM section_courses
      WHERE periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE s
      FROM sections s
      INNER JOIN leveling_runs lr ON lr.id = s.levelingRunId
      WHERE lr.periodId = ?
      `,
      [periodId]
    );

    await manager.query(
      `
      DELETE FROM leveling_runs
      WHERE periodId = ?
      `,
      [periodId]
    );
  }

}

