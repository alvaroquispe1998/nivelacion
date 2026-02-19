import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodEntity } from './period.entity';

@Injectable()
export class PeriodsService {
  constructor(
    @InjectRepository(PeriodEntity)
    private readonly periodsRepo: Repository<PeriodEntity>
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

  async clearData(id: string) {
    const period = await this.periodsRepo.findOne({ where: { id } });
    if (!period) throw new NotFoundException('Period not found');

    await this.periodsRepo.manager.transaction(async (manager) => {
      // 1. Delete student enrollments
      await manager.query(
        `
        DELETE ssc
        FROM section_student_courses ssc
        INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
        WHERE sc.periodId = ?
        `,
        [id]
      );

      // 2. Delete course teachers
      await manager.query(
        `
        DELETE sct
        FROM section_course_teachers sct
        INNER JOIN section_courses sc ON sc.id = sct.sectionCourseId
        WHERE sc.periodId = ?
        `,
        [id]
      );

      // 3. Delete schedule blocks
      await manager.query(
        `
        DELETE sb
        FROM schedule_blocks sb
        INNER JOIN section_courses sc ON sc.id = sb.sectionCourseId
        WHERE sc.periodId = ?
        `,
        [id]
      );

      // 4. Delete leveling runs demands
      await manager.query(
        `
        DELETE lrd
        FROM leveling_run_student_course_demands lrd
        INNER JOIN leveling_runs lr ON lr.id = lrd.runId
        WHERE lr.periodId = ?
        `,
        [id]
      );

      // 5. Delete sections (only those tied to a leveling run of this period)
      // Note: section_courses for these are handled next, or cascading?
      // Wait, section_courses has periodId. Sections has levelingRunId -> periodId.

      // Delete section courses first
      await manager.query(
        `
        DELETE FROM section_courses
        WHERE periodId = ?
        `,
        [id]
      );

      // 6. Delete sections
      await manager.query(
        `
        DELETE s
        FROM sections s
        INNER JOIN leveling_runs lr ON lr.id = s.levelingRunId
        WHERE lr.periodId = ?
        `,
        [id]
      );

      // 7. Delete leveling runs
      await manager.query(
        `
        DELETE FROM leveling_runs
        WHERE periodId = ?
        `,
        [id]
      );
    });

    return { ok: true };
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

  private async findActiveOrNull() {
    return this.periodsRepo.findOne({
      where: { status: 'ACTIVE' },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }
}

