import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateScheduleBlockDto } from './dto/create-schedule-block.dto';
import { UpdateScheduleBlockDto } from './dto/update-schedule-block.dto';
import { ScheduleBlocksService } from './schedule-blocks.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/schedule-blocks')
export class ScheduleBlocksController {
  constructor(private readonly blocksService: ScheduleBlocksService) {}

  @Get()
  async list(@Query('sectionId') sectionId?: string) {
    if (!sectionId) return [];
    const blocks = await this.blocksService.listBySection(sectionId);
    return blocks.map((b) => ({
      id: b.id,
      sectionId: b.section.id,
      courseName: b.courseName,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      zoomUrl: b.zoomUrl,
      location: b.location,
    }));
  }

  @Post()
  async create(@Body() dto: CreateScheduleBlockDto) {
    const block = await this.blocksService.create({
      sectionId: dto.sectionId,
      courseName: dto.courseName,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      zoomUrl: dto.zoomUrl ?? null,
      location: dto.location ?? null,
    });
    return {
      id: block.id,
      sectionId: block.section.id,
      courseName: block.courseName,
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      zoomUrl: block.zoomUrl,
      location: block.location,
    };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleBlockDto) {
    const block = await this.blocksService.update(id, {
      courseName: dto.courseName,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      zoomUrl: dto.zoomUrl ?? null,
      location: dto.location ?? null,
    });
    return {
      id: block.id,
      sectionId: block.section.id,
      courseName: block.courseName,
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      zoomUrl: block.zoomUrl,
      location: block.location,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blocksService.remove(id);
  }
}

