import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PeriodsService } from './periods.service';

@ApiTags('periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('periods')
export class PeriodsPublicController {
  constructor(private readonly periodsService: PeriodsService) {}

  @Get('active')
  async getActive() {
    const row = await this.periodsService.getActivePeriodOrThrow();
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

