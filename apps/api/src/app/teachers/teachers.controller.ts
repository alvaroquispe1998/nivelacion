import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ADMIN_BACKOFFICE_ROLES } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeachersService } from './teachers.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_BACKOFFICE_ROLES)
@Controller('admin/teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get()
  async list() {
    const rows = await this.teachersService.list();
    return rows.map((x) => ({
      id: x.id,
      dni: x.dni,
      fullName: x.fullName,
    }));
  }

  @Post()
  async create(@Body() dto: CreateTeacherDto, @CurrentUser() user: JwtUser) {
    const created = await this.teachersService.create({
      dni: dto.dni,
      fullName: dto.fullName,
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
    return {
      id: created.id,
      dni: created.dni,
      fullName: created.fullName,
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser() user: JwtUser
  ) {
    const updated = await this.teachersService.update(id, {
      dni: dto.dni,
      fullName: dto.fullName,
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
    return {
      id: updated.id,
      dni: updated.dni,
      fullName: updated.fullName,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.teachersService.remove(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }
}
