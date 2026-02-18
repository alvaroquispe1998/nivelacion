import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SectionsService } from '../sections/sections.service';
import { timesOverlap } from '../common/utils/time.util';
import { ScheduleBlockEntity } from './schedule-block.entity';

@Injectable()
export class ScheduleBlocksService {
  constructor(
    @InjectRepository(ScheduleBlockEntity)
    private readonly blocksRepo: Repository<ScheduleBlockEntity>,
    private readonly sectionsService: SectionsService
  ) {}

  async listBySection(sectionId: string, courseName?: string) {
    const normalizedCourse = String(courseName ?? '').trim();
    if (!normalizedCourse) {
      const activePeriodId = await this.loadActivePeriodIdOrThrow();
      const rows: Array<{ id: string }> = await this.blocksRepo.manager.query(
        `
        SELECT b.id AS id
        FROM schedule_blocks b
        INNER JOIN section_courses sc ON sc.id = b.sectionCourseId
        WHERE b.sectionId = ?
          AND sc.periodId = ?
        ORDER BY b.dayOfWeek ASC, b.startTime ASC
        `,
        [sectionId, activePeriodId]
      );
      const blockIds = rows.map((row) => String(row.id || '').trim()).filter(Boolean);
      if (blockIds.length === 0) return [];
      return this.blocksRepo.find({
        where: blockIds.map((id) => ({ id })),
        relations: { section: true },
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
      });
    }

    const sectionCourse = await this.sectionsService.resolveSectionCourseByName({
      sectionId,
      courseName: normalizedCourse,
    });
    if (!sectionCourse) return [];

    return this.blocksRepo.find({
      where: { sectionCourseId: sectionCourse.id },
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async listBySectionCourse(sectionCourseId: string) {
    return this.blocksRepo.find({
      where: { sectionCourseId },
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  private async assertNoOverlap(params: {
    sectionCourseId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    excludeId?: string;
  }) {
    const existing = await this.blocksRepo.find({
      where: {
        sectionCourseId: params.sectionCourseId,
        dayOfWeek: params.dayOfWeek,
      },
    });

    const overlaps = existing.some((b) => {
      if (params.excludeId && b.id === params.excludeId) return false;
      return timesOverlap(params.startTime, params.endTime, b.startTime, b.endTime);
    });

    if (overlaps) {
      throw new ConflictException('Schedule block overlaps with an existing block');
    }
  }

  async create(body: {
    sectionId: string;
    sectionCourseId?: string | null;
    courseName: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startDate?: string | null;
    endDate?: string | null;
    zoomUrl?: string | null;
    location?: string | null;
  }) {
    if (body.startTime >= body.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }
    if (body.startDate && body.endDate && body.startDate > body.endDate) {
      throw new BadRequestException('startDate must be <= endDate');
    }

    const section = await this.sectionsService.getByIdOrThrow(body.sectionId);
    const sectionCourse = body.sectionCourseId
      ? await this.sectionsService.getSectionCourseById(body.sectionCourseId)
      : await this.sectionsService.resolveSectionCourseByName({
          sectionId: section.id,
          courseName: body.courseName,
        });
    if (!sectionCourse) {
      throw new BadRequestException(
        `Section-course relation not found for section ${section.id} and course ${body.courseName}`
      );
    }
    if (sectionCourse.sectionId !== section.id) {
      throw new BadRequestException(
        `sectionCourseId ${sectionCourse.id} does not belong to section ${section.id}`
      );
    }

    await this.assertNoOverlap({
      sectionCourseId: sectionCourse.id,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
    });

    const block = this.blocksRepo.create({
      section,
      sectionCourseId: sectionCourse.id,
      courseName: sectionCourse.courseName,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      zoomUrl: body.zoomUrl ?? null,
      location: body.location ?? null,
    });
    return this.blocksRepo.save(block);
  }

  async update(
    id: string,
    body: Partial<{
      courseName: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
      zoomUrl: string | null;
      location: string | null;
    }>
  ) {
    const block = await this.blocksRepo.findOne({
      where: { id },
      relations: { section: true },
    });
    if (!block) throw new NotFoundException('Schedule block not found');

    const next = {
      courseName: body.courseName ?? block.courseName,
      dayOfWeek: body.dayOfWeek ?? block.dayOfWeek,
      startTime: body.startTime ?? block.startTime,
      endTime: body.endTime ?? block.endTime,
      startDate: body.startDate !== undefined ? body.startDate : block.startDate,
      endDate: body.endDate !== undefined ? body.endDate : block.endDate,
      zoomUrl: body.zoomUrl ?? block.zoomUrl,
      location: body.location ?? block.location,
    };

    if (next.startTime >= next.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }
    if (next.startDate && next.endDate && next.startDate > next.endDate) {
      throw new BadRequestException('startDate must be <= endDate');
    }

    const nextSectionCourse = await this.sectionsService.resolveSectionCourseByName({
      sectionId: block.section.id,
      courseName: next.courseName,
    });
    if (!nextSectionCourse) {
      throw new BadRequestException(
        `Section-course relation not found for section ${block.section.id} and course ${next.courseName}`
      );
    }

    await this.assertNoOverlap({
      sectionCourseId: nextSectionCourse.id,
      dayOfWeek: next.dayOfWeek,
      startTime: next.startTime,
      endTime: next.endTime,
      excludeId: block.id,
    });

    block.sectionCourseId = nextSectionCourse.id;
    block.courseName = nextSectionCourse.courseName;
    block.dayOfWeek = next.dayOfWeek;
    block.startTime = next.startTime;
    block.endTime = next.endTime;
    block.startDate = next.startDate ?? null;
    block.endDate = next.endDate ?? null;
    block.zoomUrl = next.zoomUrl;
    block.location = next.location;

    return this.blocksRepo.save(block);
  }

  async remove(id: string) {
    const block = await this.blocksRepo.findOne({ where: { id } });
    if (!block) throw new NotFoundException('Schedule block not found');
    await this.blocksRepo.remove(block);
    return { ok: true };
  }

  private async loadActivePeriodIdOrThrow() {
    const rows: Array<{ id: string }> = await this.blocksRepo.manager.query(
      `
      SELECT id
      FROM periods
      WHERE status = 'ACTIVE'
      ORDER BY updatedAt DESC, createdAt DESC
      LIMIT 1
      `
    );
    const id = String(rows[0]?.id ?? '').trim();
    if (!id) {
      throw new BadRequestException('No active period configured');
    }
    return id;
  }
}
