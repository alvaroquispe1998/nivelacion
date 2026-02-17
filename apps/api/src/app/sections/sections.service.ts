import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SectionEntity } from './section.entity';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(SectionEntity)
    private readonly sectionsRepo: Repository<SectionEntity>
  ) {}

  async list(): Promise<SectionEntity[]> {
    return this.sectionsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async create(body: {
    name: string;
    code?: string | null;
    akademicSectionId?: string | null;
    facultyGroup?: string | null;
    facultyName?: string | null;
    campusName?: string | null;
    modality?: string | null;
    initialCapacity?: number | null;
    maxExtraCapacity?: number | null;
    isAutoLeveling?: boolean | null;
  }): Promise<SectionEntity> {
    const section = this.sectionsRepo.create({
      name: body.name,
      code: body.code ?? null,
      akademicSectionId: body.akademicSectionId ?? null,
      facultyGroup: body.facultyGroup ?? null,
      facultyName: body.facultyName ?? null,
      campusName: body.campusName ?? null,
      modality: body.modality ?? null,
      initialCapacity: body.initialCapacity ?? 45,
      maxExtraCapacity: body.maxExtraCapacity ?? 0,
      isAutoLeveling: body.isAutoLeveling ?? false,
    });
    return this.sectionsRepo.save(section);
  }

  async updateCapacity(params: {
    id: string;
    initialCapacity: number;
    maxExtraCapacity: number;
  }): Promise<SectionEntity> {
    const section = await this.getByIdOrThrow(params.id);
    section.initialCapacity = params.initialCapacity;
    section.maxExtraCapacity = params.maxExtraCapacity;
    return this.sectionsRepo.save(section);
  }

  async getByIdOrThrow(id: string): Promise<SectionEntity> {
    const section = await this.sectionsRepo.findOne({ where: { id } });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }
}
