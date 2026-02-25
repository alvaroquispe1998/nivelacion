import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { CreatePavilionDto } from './dto/create-pavilion.dto';
import { UpdateClassroomStatusDto } from './dto/update-classroom-status.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { UpdatePavilionDto } from './dto/update-pavilion.dto';
import { UpdatePavilionStatusDto } from './dto/update-pavilion-status.dto';
import { ClassroomsService } from './classrooms.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/classrooms')
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  @Get()
  async list(
    @Query('campusId') campusId?: string,
    @Query('campusName') campusName?: string,
    @Query('pavilionId') pavilionId?: string,
    @Query('status') status?: string
  ) {
    const rows = await this.classroomsService.list({
      campusId: String(campusId ?? '').trim() || undefined,
      campusName: String(campusName ?? '').trim() || undefined,
      pavilionId: String(pavilionId ?? '').trim() || undefined,
      status: String(status ?? '').trim() || undefined,
    });
    return rows;
  }

  @Get('campuses')
  listCampuses() {
    return this.classroomsService.listCampuses();
  }

  @Get('pavilions')
  listPavilions(
    @Query('campusId') campusId?: string,
    @Query('status') status?: string
  ) {
    return this.classroomsService.listPavilions({
      campusId: String(campusId ?? '').trim() || undefined,
      status: String(status ?? '').trim() || undefined,
    });
  }

  @Post('pavilions')
  createPavilion(@Body() dto: CreatePavilionDto) {
    return this.classroomsService.createPavilion({
      campusId: dto.campusId,
      code: dto.code,
      name: dto.name,
      status: dto.status,
    });
  }

  @Patch('pavilions/:id')
  updatePavilion(@Param('id') id: string, @Body() dto: UpdatePavilionDto) {
    return this.classroomsService.updatePavilion(id, {
      campusId: dto.campusId,
      code: dto.code,
      name: dto.name,
      status: dto.status,
    });
  }

  @Patch('pavilions/:id/status')
  updatePavilionStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePavilionStatusDto
  ) {
    if (!dto?.status) {
      throw new BadRequestException('status es requerido');
    }
    return this.classroomsService.updatePavilionStatus(id, dto.status);
  }

  @Delete('pavilions/:id')
  removePavilion(@Param('id') id: string) {
    return this.classroomsService.removePavilion(id);
  }

  @Post()
  async create(@Body() dto: CreateClassroomDto) {
    const created = await this.classroomsService.create({
      campusId: dto.campusId,
      pavilionId: dto.pavilionId,
      code: dto.code,
      name: dto.name,
      capacity: dto.capacity,
      levelName: dto.levelName,
      type: dto.type,
      status: dto.status,
      notes: dto.notes,
    });
    return {
      id: created.id,
      campusId: created.campusId,
      campusName: created.campusName,
      pavilionId: created.pavilionId,
      code: created.code,
      name: created.name,
      capacity: created.capacity,
      levelName: created.levelName,
      type: created.type,
      status: created.status,
      notes: created.notes,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateClassroomDto) {
    const updated = await this.classroomsService.update(id, {
      campusId: dto.campusId,
      pavilionId: dto.pavilionId,
      code: dto.code,
      name: dto.name,
      capacity: dto.capacity,
      levelName: dto.levelName,
      type: dto.type,
      status: dto.status,
      notes: dto.notes,
    });
    return {
      id: updated.id,
      campusId: updated.campusId,
      campusName: updated.campusName,
      pavilionId: updated.pavilionId,
      code: updated.code,
      name: updated.name,
      capacity: updated.capacity,
      levelName: updated.levelName,
      type: updated.type,
      status: updated.status,
      notes: updated.notes,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClassroomStatusDto
  ) {
    if (!dto?.status) {
      throw new BadRequestException('status es requerido');
    }
    const updated = await this.classroomsService.updateStatus(id, dto.status);
    return {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.classroomsService.remove(id);
  }
}
