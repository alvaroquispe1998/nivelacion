import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodEntity } from './period.entity';

@Injectable()
export class PeriodsService {
  constructor(
    @InjectRepository(PeriodEntity)
    private readonly periodsRepo: Repository<PeriodEntity>
  ) {}

  async list() {
    return this.periodsRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async create(params: {
    code: string;
    name: string;
    kind?: 'LEVELING' | 'SEMESTER';
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
      kind: params.kind ?? 'LEVELING',
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

