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
import { SectionsService } from '../sections/sections.service';

@ApiTags('teacher')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCENTE)
@Controller('teacher')
export class TeacherController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly attendanceService: AttendanceService,
    private readonly sectionsService: SectionsService
  ) {}

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
      zoomUrl: string | null;
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
        b.zoomUrl AS zoomUrl,
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
      zoomUrl: row.zoomUrl ? String(row.zoomUrl) : null,
      location: row.location ? String(row.location) : null,
      sectionName: String(row.sectionName ?? ''),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
    }));
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
      zoomUrl: string | null;
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
        zoomUrl,
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
      zoomUrl: row.zoomUrl ? String(row.zoomUrl) : null,
      location: row.location ? String(row.location) : null,
    }));
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
