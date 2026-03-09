import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AttendanceService } from '../attendance/attendance.service';
import { CreateAttendanceSessionDto } from '../attendance/dto/create-attendance-session.dto';
import { UpdateAttendanceRecordDto } from '../attendance/dto/update-attendance-record.dto';
import { ScheduleBlocksService } from '../schedule-blocks/schedule-blocks.service';
import { SectionsService } from '../sections/sections.service';
import { WorkshopsService } from '../workshops/workshops.service';

@ApiTags('teacher')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCENTE)
@Controller('teacher')
export class TeacherController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly attendanceService: AttendanceService,
    private readonly scheduleBlocksService: ScheduleBlocksService,
    private readonly sectionsService: SectionsService,
    private readonly workshopsService: WorkshopsService
  ) {}

  @Get('courses')
  courses(@CurrentUser() user: JwtUser) {
    return this.sectionsService.listTeacherAssignments(user.sub);
  }

  @Get('assignments')
  assignments(@CurrentUser() user: JwtUser) {
    return this.sectionsService.listTeacherAssignments(user.sub);
  }

  @Get('schedule')
  async schedule(@CurrentUser() user: JwtUser) {
    const rows: Array<{
      id: string;
      sectionId: string;
      sectionCourseId: string;
      courseName: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
      zoomMeetingRecordId: string | null;
      joinUrl: string | null;
      startUrl: string | null;
      location: string | null;
      sectionName: string;
      sectionCode: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        b.id AS id,
        b.sectionId AS sectionId,
        b.sectionCourseId AS sectionCourseId,
        b.courseName AS courseName,
        b.dayOfWeek AS dayOfWeek,
        b.startTime AS startTime,
        b.endTime AS endTime,
        b.startDate AS startDate,
        b.endDate AS endDate,
        b.zoomMeetingRecordId AS zoomMeetingRecordId,
        b.joinUrl AS joinUrl,
        b.startUrl AS startUrl,
        b.location AS location,
        s.name AS sectionName,
        s.code AS sectionCode
      FROM section_course_teachers sct
      INNER JOIN section_courses sc ON sc.id = sct.sectionCourseId
      INNER JOIN schedule_blocks b ON b.sectionCourseId = sct.sectionCourseId
      INNER JOIN sections s ON s.id = b.sectionId
      WHERE sct.teacherId = ?
        AND sc.periodId = (
          SELECT p.id
          FROM periods p
          WHERE p.status = 'ACTIVE'
          ORDER BY p.updatedAt DESC, p.createdAt DESC
          LIMIT 1
        )
      ORDER BY b.dayOfWeek ASC, b.startTime ASC, s.code ASC, s.name ASC
      `,
      [user.sub]
    );

    const courseItems = rows.map((row) => ({
      id: String(row.id),
      kind: 'COURSE' as const,
      sectionId: String(row.sectionId),
      sectionCourseId: String(row.sectionCourseId),
      courseName: String(row.courseName ?? ''),
      dayOfWeek: Number(row.dayOfWeek),
      startTime: String(row.startTime ?? ''),
      endTime: String(row.endTime ?? ''),
      startDate: this.toIsoDateOnly(row.startDate),
      endDate: this.toIsoDateOnly(row.endDate),
      zoomMeetingRecordId: row.zoomMeetingRecordId
        ? String(row.zoomMeetingRecordId)
        : null,
      joinUrl: row.joinUrl ? String(row.joinUrl) : null,
      startUrl: row.startUrl ? String(row.startUrl) : null,
      location: row.location ? String(row.location) : null,
      sectionName: String(row.sectionName ?? ''),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
    }));
    const workshopItems = await this.workshopsService.listTeacherScheduleItems(user.sub);
    return [...courseItems, ...workshopItems].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courseName.localeCompare(b.courseName, 'es', { sensitivity: 'base' });
    });
  }

  @Get('workshops')
  workshops(@CurrentUser() user: JwtUser) {
    return this.workshopsService.listTeacherWorkshops(user.sub);
  }

  @Get('workshops/:applicationId/groups')
  workshopGroups(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.workshopsService.listTeacherWorkshopGroups(user.sub, applicationId);
  }

  @Get('workshop-attendance')
  workshopAttendance(
    @Query('applicationGroupId') applicationGroupId: string | undefined,
    @Query('date') date: string | undefined,
    @CurrentUser() user: JwtUser
  ) {
    const groupId = String(applicationGroupId ?? '').trim();
    const sessionDate = String(date ?? '').trim();
    if (!groupId) {
      throw new BadRequestException('applicationGroupId is required');
    }
    if (!sessionDate) {
      throw new BadRequestException('date is required');
    }
    return this.workshopsService.getTeacherWorkshopAttendance(
      user.sub,
      groupId,
      sessionDate
    );
  }

  @Put('workshop-attendance')
  updateWorkshopAttendance(
    @Body()
    body: {
      applicationGroupId?: string;
      sessionDate?: string;
      items?: Array<{
        studentId?: string;
        status?: string;
        notes?: string | null;
      }>;
    },
    @CurrentUser() user: JwtUser
  ) {
    const applicationGroupId = String(body?.applicationGroupId ?? '').trim();
    const sessionDate = String(body?.sessionDate ?? '').trim();
    if (!applicationGroupId) {
      throw new BadRequestException('applicationGroupId is required');
    }
    if (!sessionDate) {
      throw new BadRequestException('sessionDate is required');
    }
    return this.workshopsService.saveTeacherWorkshopAttendance({
      teacherId: user.sub,
      applicationGroupId,
      sessionDate,
      items: Array.isArray(body?.items)
        ? body.items.map((item) => ({
            studentId: String(item?.studentId ?? '').trim(),
            status: String(item?.status ?? 'FALTO').trim() as any,
            notes: item?.notes ?? null,
          }))
        : [],
    });
  }

  @Get('section-courses/:sectionCourseId/students')
  async students(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ) {
    await this.assertTeacherAssignmentOrThrow(user.sub, sectionCourseId);
    const rows: Array<{
      id: string;
      dni: string;
      codigoAlumno: string | null;
      fullName: string;
    }> = await this.dataSource.query(
      `
      SELECT
        u.id AS id,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName
      FROM section_student_courses ssc
      INNER JOIN users u ON u.id = ssc.studentId
      WHERE ssc.sectionCourseId = ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [sectionCourseId]
    );
    return rows.map((row) => ({
      id: String(row.id),
      dni: String(row.dni ?? ''),
      codigoAlumno: row.codigoAlumno ? String(row.codigoAlumno) : null,
      fullName: String(row.fullName ?? ''),
    }));
  }

  @Get('section-courses/:sectionCourseId/blocks')
  async blocks(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ) {
    await this.assertTeacherAssignmentOrThrow(user.sub, sectionCourseId);
    const rows: Array<{
      id: string;
      sectionId: string;
      sectionCourseId: string;
      courseName: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
      zoomMeetingRecordId: string | null;
      joinUrl: string | null;
      startUrl: string | null;
      location: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        id,
        sectionId,
        sectionCourseId,
        courseName,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        zoomMeetingRecordId,
        joinUrl,
        startUrl,
        location
      FROM schedule_blocks
      WHERE sectionCourseId = ?
      ORDER BY dayOfWeek ASC, startTime ASC
      `,
      [sectionCourseId]
    );
    return rows.map((row) => ({
      id: String(row.id),
      sectionId: String(row.sectionId),
      sectionCourseId: String(row.sectionCourseId),
      courseName: String(row.courseName ?? ''),
      dayOfWeek: Number(row.dayOfWeek),
      startTime: String(row.startTime ?? ''),
      endTime: String(row.endTime ?? ''),
      startDate: this.toIsoDateOnly(row.startDate),
      endDate: this.toIsoDateOnly(row.endDate),
      zoomMeetingRecordId: row.zoomMeetingRecordId
        ? String(row.zoomMeetingRecordId)
        : null,
      joinUrl: row.joinUrl ? String(row.joinUrl) : null,
      startUrl: row.startUrl ? String(row.startUrl) : null,
      location: row.location ? String(row.location) : null,
    }));
  }

  @Post('schedule-blocks/:id/refresh-meeting-links')
  async refreshMeetingLinks(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser
  ) {
    const block = await this.scheduleBlocksService.getByIdOrThrow(id);
    const sectionCourseId = String(block.sectionCourseId ?? '').trim();
    if (!sectionCourseId) {
      throw new BadRequestException('Schedule block is not linked to a section-course');
    }
    await this.assertTeacherAssignmentOrThrow(user.sub, sectionCourseId);
    return this.scheduleBlocksService.refreshMeetingLinks(id);
  }

  @Post('workshop-schedule-blocks/:id/refresh-meeting-links')
  refreshWorkshopMeetingLinks(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.workshopsService.refreshTeacherWorkshopScheduleBlockLinks(user.sub, id);
  }

  @Get('attendance-sessions')
  async sessions(
    @Query('sectionCourseId') sectionCourseId: string | undefined,
    @CurrentUser() user: JwtUser
  ) {
    const id = String(sectionCourseId ?? '').trim();
    if (!id) {
      throw new BadRequestException('sectionCourseId is required');
    }
    await this.assertTeacherAssignmentOrThrow(user.sub, id);
    return this.attendanceService.listSessionsBySectionCourse(id);
  }

  @Post('attendance-sessions')
  async createSession(
    @Body() dto: CreateAttendanceSessionDto,
    @CurrentUser() user: JwtUser
  ) {
    const session = await this.attendanceService.createSession({
      scheduleBlockId: dto.scheduleBlockId,
      sessionDate: dto.sessionDate,
      actorUserId: user.sub,
    });
    return {
      id: session.id,
      scheduleBlockId: session.scheduleBlock.id,
      sessionDate: session.sessionDate,
    };
  }

  @Get('attendance-sessions/:id/records')
  async records(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const canManage = await this.attendanceService.canTeacherManageSession(id, user.sub);
    if (!canManage) {
      throw new BadRequestException('Teacher is not assigned to this session');
    }
    return this.attendanceService.getRecords(id);
  }

  @Put('attendance-sessions/:id/records')
  async updateRecords(
    @Param('id') id: string,
    @Body() body: UpdateAttendanceRecordDto[],
    @CurrentUser() user: JwtUser
  ) {
    const canManage = await this.attendanceService.canTeacherManageSession(id, user.sub);
    if (!canManage) {
      throw new BadRequestException('Teacher is not assigned to this session');
    }
    return this.attendanceService.updateRecords(
      id,
      body.map((x) => ({
        studentId: x.studentId,
        status: x.status,
        notes: x.notes ?? null,
      })),
      user.sub
    );
  }

  private async assertTeacherAssignmentOrThrow(teacherId: string, sectionCourseId: string) {
    const assigned = await this.sectionsService.isTeacherAssignedToSectionCourse({
      teacherId,
      sectionCourseId,
    });
    if (assigned) return;
    throw new BadRequestException(
      `Teacher ${teacherId} is not assigned to section-course ${sectionCourseId}`
    );
  }

  private toIsoDateOnly(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return null;
      const directDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
      if (directDate) return directDate[1];

      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return null;
      return this.toLocalIsoDate(parsed);
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return this.toLocalIsoDate(value);
    }
    return null;
  }

  private toLocalIsoDate(value: Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
