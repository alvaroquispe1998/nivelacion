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
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeachersService } from './teachers.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
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
  async create(@Body() dto: CreateTeacherDto) {
    const created = await this.teachersService.create({
      dni: dto.dni,
      fullName: dto.fullName,
    });
    return {
      id: created.id,
      dni: created.dni,
      fullName: created.fullName,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    const updated = await this.teachersService.update(id, {
      dni: dto.dni,
      fullName: dto.fullName,
    });
    return {
      id: updated.id,
      dni: updated.dni,
      fullName: updated.fullName,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.teachersService.remove(id);
  }
}
