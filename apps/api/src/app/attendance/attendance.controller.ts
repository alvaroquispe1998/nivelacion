import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ADMIN_BACKOFFICE_ROLES } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GradesService } from '../grades/grades.service';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_BACKOFFICE_ROLES)
@Controller('admin/attendance-sessions')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly gradesService: GradesService
  ) {}

  @Post()
  async create(@Body() dto: CreateAttendanceSessionDto, @CurrentUser() user: JwtUser) {
    const session = await this.attendanceService.createSession({
      scheduleBlockId: dto.scheduleBlockId,
      sessionDate: dto.sessionDate,
      actorUserId: user.sub,
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
    return {
      id: session.id,
      scheduleBlockId: session.scheduleBlock.id,
      sessionDate: session.sessionDate,
    };
  }

  @Get()
  list(@Query('sectionId') sectionId?: string) {
    if (!sectionId) return [];
    return this.attendanceService.listSessionsBySection(sectionId);
  }

  @Get(':id/records')
  records(@Param('id') id: string) {
    return this.attendanceService.getRecords(id);
  }

  @Get('export/pdf')
  async exportPdf(
    @Query('sectionCourseId') sectionCourseId?: string,
    @Query('scheduleBlockId') scheduleBlockId?: string
  ): Promise<StreamableFile> {
    const safeSectionCourseId = String(sectionCourseId ?? '').trim();
    const safeScheduleBlockId = String(scheduleBlockId ?? '').trim();
    if (!safeSectionCourseId || !safeScheduleBlockId) {
      throw new BadRequestException(
        'sectionCourseId y scheduleBlockId son requeridos para exportar asistencia'
      );
    }
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminSectionCourseAttendancePdf(
        safeSectionCourseId,
        safeScheduleBlockId
      );
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Put(':id/records')
  update(
    @Param('id') id: string,
    @Body() body: UpdateAttendanceRecordDto[],
    @CurrentUser() user: JwtUser
  ) {
    return this.attendanceService.updateRecords(
      id,
      body.map((x) => ({
        studentId: x.studentId,
        status: x.status,
        notes: x.notes ?? null,
      })),
      user.sub,
      {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      }
    );
  }
}
