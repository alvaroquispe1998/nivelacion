import { Body, Controller, Get, Param, Patch, Post, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ADMIN_BACKOFFICE_ROLES } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreatePeriodDto } from './dto/create-period.dto';
import { UpdatePeriodDto } from './dto/update-period.dto';
import { PeriodsService } from './periods.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_BACKOFFICE_ROLES)
@Controller(['admin/periods', 'admin/peridos'])
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) { }

  @Get()
  async list() {
    const rows = await this.periodsService.list();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  @Post()
  async create(@Body() dto: CreatePeriodDto, @CurrentUser() user: JwtUser) {
    const row = await this.periodsService.create({
      code: dto.code,
      name: dto.name,
      kind: dto.kind,
      startsAt: dto.startsAt ?? null,
      endsAt: dto.endsAt ?? null,
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePeriodDto,
    @CurrentUser() user: JwtUser
  ) {
    const row = await this.periodsService.update(id, {
      name: dto.name,
      startsAt: dto.startsAt ?? null,
      endsAt: dto.endsAt ?? null,
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
  }

  @Patch(':id/activate')
  async activate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const row = await this.periodsService.activate(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
  }

  @Delete(':id/data')
  async clearData(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.periodsService.clearData(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Delete(':id')
  async deletePeriod(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.periodsService.deletePeriod(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }
}

