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

  async listBySection(sectionId: string) {
    return this.blocksRepo.find({
      where: { section: { id: sectionId } },
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  private async assertNoOverlap(params: {
    sectionId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    excludeId?: string;
  }) {
    const existing = await this.blocksRepo.find({
      where: {
        section: { id: params.sectionId },
        dayOfWeek: params.dayOfWeek,
      },
      relations: { section: true },
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
    courseName: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    zoomUrl?: string | null;
    location?: string | null;
  }) {
    if (body.startTime >= body.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    const section = await this.sectionsService.getByIdOrThrow(body.sectionId);
    await this.assertNoOverlap({
      sectionId: section.id,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
    });

    const block = this.blocksRepo.create({
      section,
      courseName: body.courseName,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
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
      zoomUrl: body.zoomUrl ?? block.zoomUrl,
      location: body.location ?? block.location,
    };

    if (next.startTime >= next.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    await this.assertNoOverlap({
      sectionId: block.section.id,
      dayOfWeek: next.dayOfWeek,
      startTime: next.startTime,
      endTime: next.endTime,
      excludeId: block.id,
    });

    block.courseName = next.courseName;
    block.dayOfWeek = next.dayOfWeek;
    block.startTime = next.startTime;
    block.endTime = next.endTime;
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
}

