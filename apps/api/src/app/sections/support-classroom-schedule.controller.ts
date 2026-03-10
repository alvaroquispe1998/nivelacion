import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SectionsService } from './sections.service';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SOPORTE_TECNICO)
@Controller('support/classroom-schedule')
export class SupportClassroomScheduleController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get('campuses')
  listCampuses() {
    return this.sectionsService.listCampusesWithScheduledClassrooms();
  }

  @Get('classrooms')
  listClassrooms(@Query('campusName') campusName?: string) {
    const normalizedCampusName = String(campusName ?? '').trim();
    if (!normalizedCampusName) {
      throw new BadRequestException('campusName is required');
    }
    return this.sectionsService.listClassroomsWithScheduleByCampus(normalizedCampusName);
  }

  @Get()
  getSchedule(
    @Query('campusName') campusName?: string,
    @Query('classroomId') classroomId?: string
  ) {
    const normalizedCampusName = String(campusName ?? '').trim();
    const normalizedClassroomId = String(classroomId ?? '').trim();
    if (!normalizedCampusName) {
      throw new BadRequestException('campusName is required');
    }
    if (!normalizedClassroomId) {
      throw new BadRequestException('classroomId is required');
    }
    return this.sectionsService.getClassroomSchedule({
      campusName: normalizedCampusName,
      classroomId: normalizedClassroomId,
    });
  }
}
