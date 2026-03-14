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
import { ADMIN_BACKOFFICE_ROLES } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateScheduleBlockDto } from './dto/create-schedule-block.dto';
import { UpdateScheduleBlockDto } from './dto/update-schedule-block.dto';
import { ScheduleBlocksService } from './schedule-blocks.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_BACKOFFICE_ROLES)
@Controller('admin/schedule-blocks')
export class ScheduleBlocksController {
  constructor(private readonly blocksService: ScheduleBlocksService) {}

  @Get()
  async list(
    @Query('sectionId') sectionId?: string,
    @Query('courseName') courseName?: string
  ) {
    if (!sectionId) return [];
    const blocks = await this.blocksService.listBySection(sectionId, courseName);
    return blocks.map((b) => ({
      id: b.id,
      sectionId: b.section.id,
      sectionCourseId: b.sectionCourseId,
      courseName: b.courseName,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      startDate: b.startDate,
      endDate: b.endDate,
      zoomMeetingRecordId: b.zoomMeetingRecordId,
      joinUrl: b.joinUrl,
      startUrl: b.startUrl,
      location: b.location,
      referenceModality: b.referenceModality,
      referenceClassroom: b.referenceClassroom,
    }));
  }

  @Post()
  async create(@Body() dto: CreateScheduleBlockDto) {
    const result = await this.blocksService.create({
      sectionId: dto.sectionId,
      sectionCourseId: dto.sectionCourseId ?? null,
      courseName: dto.courseName,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      zoomMeetingRecordId: dto.zoomMeetingRecordId ?? null,
      joinUrl: dto.joinUrl ?? null,
      startUrl: dto.startUrl ?? null,
      location: dto.location ?? null,
      referenceModality: dto.referenceModality ?? null,
      referenceClassroom: dto.referenceClassroom ?? null,
      applyToWholeCourse: Boolean(dto.applyToWholeCourse),
      applyTeacherToWholeCourse: Boolean(dto.applyTeacherToWholeCourse),
      scopeFacultyGroup: dto.scopeFacultyGroup ?? null,
      scopeCampusName: dto.scopeCampusName ?? null,
      scopeCourseName: dto.scopeCourseName ?? null,
    });
    const block = result.block;
    return {
      id: block.id,
      sectionId: block.section.id,
      sectionCourseId: block.sectionCourseId,
      courseName: block.courseName,
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      startDate: block.startDate,
      endDate: block.endDate,
      zoomMeetingRecordId: block.zoomMeetingRecordId,
      joinUrl: block.joinUrl,
      startUrl: block.startUrl,
      location: block.location,
      referenceModality: block.referenceModality,
      referenceClassroom: block.referenceClassroom,
      warnings: result.warnings,
    };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleBlockDto) {
    const result = await this.blocksService.update(id, {
      courseName: dto.courseName,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      startDate: dto.startDate,
      endDate: dto.endDate,
      zoomMeetingRecordId: dto.zoomMeetingRecordId,
      joinUrl: dto.joinUrl,
      startUrl: dto.startUrl,
      location: dto.location,
      referenceModality: dto.referenceModality,
      referenceClassroom: dto.referenceClassroom,
      applyToWholeCourse: dto.applyToWholeCourse,
      applyTeacherToWholeCourse: dto.applyTeacherToWholeCourse,
      scopeFacultyGroup: dto.scopeFacultyGroup,
      scopeCampusName: dto.scopeCampusName,
      scopeCourseName: dto.scopeCourseName,
    });
    const block = result.block;
    return {
      id: block.id,
      sectionId: block.section.id,
      sectionCourseId: block.sectionCourseId,
      courseName: block.courseName,
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      startDate: block.startDate,
      endDate: block.endDate,
      zoomMeetingRecordId: block.zoomMeetingRecordId,
      joinUrl: block.joinUrl,
      startUrl: block.startUrl,
      location: block.location,
      referenceModality: block.referenceModality,
      referenceClassroom: block.referenceClassroom,
      warnings: result.warnings,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blocksService.remove(id);
  }

  @Post(':id/refresh-meeting-links')
  refreshMeetingLinks(@Param('id') id: string) {
    return this.blocksService.refreshMeetingLinks(id);
  }
}
