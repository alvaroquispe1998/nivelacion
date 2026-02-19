import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateSectionDto } from './dto/create-section.dto';
import { AssignSectionCourseTeacherDto } from './dto/assign-section-course-teacher.dto';
import { AssignSectionTeacherDto } from './dto/assign-section-teacher.dto';
import { ReassignStudentSectionCourseDto } from './dto/reassign-student-section-course.dto';
import { UpdateSectionCapacityDto } from './dto/update-section-capacity.dto';
import { SectionsService } from './sections.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  async list(
    @Query('facultyGroup') facultyGroup?: string,
    @Query('campusName') campusName?: string,
    @Query('courseName') courseName?: string
  ) {
    const shouldFilterByCourse =
      Boolean(facultyGroup?.trim()) ||
      Boolean(campusName?.trim()) ||
      Boolean(courseName?.trim());
    if (
      shouldFilterByCourse &&
      (!facultyGroup?.trim() || !campusName?.trim() || !courseName?.trim())
    ) {
      throw new BadRequestException(
        'facultyGroup, campusName and courseName are required together'
      );
    }

    const rows = shouldFilterByCourse
      ? await this.sectionsService.listByCourseFilter({
          facultyGroup: (facultyGroup ?? '').trim(),
          campusName: (campusName ?? '').trim(),
          courseName: (courseName ?? '').trim(),
        })
      : await this.sectionsService.list();

    return rows.map((row) => {
      const s = row.section;
      const studentCount = row.studentCount;
      const scheduleSummary = (row as { scheduleSummary?: string | null }).scheduleSummary ?? null;
      const hasSchedule = Boolean((row as { hasSchedule?: boolean }).hasSchedule);
      return {
      id: s.id,
      name: s.name,
      code: s.code,
      akademicSectionId: s.akademicSectionId,
      facultyGroup: s.facultyGroup,
      facultyName: s.facultyName,
      campusName: s.campusName,
      modality: s.modality,
      initialCapacity: s.initialCapacity,
      maxExtraCapacity: s.maxExtraCapacity,
      isAutoLeveling: s.isAutoLeveling,
      teacherId: s.teacher?.id ?? null,
      teacherDni: s.teacher?.dni ?? null,
      teacherName: s.teacher?.fullName ?? null,
      studentCount,
      scheduleSummary,
      hasSchedule,
      };
    });
  }

  @Get('filters/faculties')
  listFaculties() {
    return this.sectionsService.listFacultyFilters();
  }

  @Get('schedule-conflicts')
  listScheduleConflicts(
    @Query('facultyGroup') facultyGroup?: string,
    @Query('campusName') campusName?: string,
    @Query('courseName') courseName?: string,
    @Query('studentCode') studentCode?: string
  ) {
    return this.sectionsService.listScheduleConflicts({
      facultyGroup: String(facultyGroup ?? '').trim() || undefined,
      campusName: String(campusName ?? '').trim() || undefined,
      courseName: String(courseName ?? '').trim() || undefined,
      studentCode: String(studentCode ?? '').trim() || undefined,
    });
  }

  @Get('schedule-conflicts/reassignment-options')
  listReassignmentOptions(
    @Query('studentId') studentId?: string,
    @Query('fromSectionCourseId') fromSectionCourseId?: string
  ) {
    const sid = String(studentId ?? '').trim();
    const from = String(fromSectionCourseId ?? '').trim();
    if (!sid) {
      throw new BadRequestException('studentId is required');
    }
    if (!from) {
      throw new BadRequestException('fromSectionCourseId is required');
    }
    return this.sectionsService.listReassignmentOptions({
      studentId: sid,
      fromSectionCourseId: from,
    });
  }

  @Post('schedule-conflicts/reassign')
  reassignStudentSectionCourse(@Body() dto: ReassignStudentSectionCourseDto) {
    return this.sectionsService.reassignStudentSectionCourse({
      studentId: dto.studentId,
      fromSectionCourseId: dto.fromSectionCourseId,
      toSectionCourseId: dto.toSectionCourseId,
      confirmOverCapacity: Boolean(dto.confirmOverCapacity),
    });
  }

  @Get('export/assigned-courses')
  listAssignedSectionCoursesForExport() {
    return this.sectionsService.listAssignedSectionCoursesForExport();
  }

  @Get('export/assigned-courses/excel')
  async exportAssignedSectionCoursesExcel(): Promise<StreamableFile> {
    const fileBuffer =
      await this.sectionsService.buildAssignedSectionCoursesExportWorkbook();
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="plantilla_docentes_seccion_curso.xlsx"',
    });
  }

  @Get('filters/campuses')
  listCampuses(@Query('facultyGroup') facultyGroup?: string) {
    const value = (facultyGroup ?? '').trim();
    if (!value) {
      throw new BadRequestException('facultyGroup is required');
    }
    return this.sectionsService.listCampusFilters(value);
  }

  @Get('filters/courses')
  listCourses(
    @Query('facultyGroup') facultyGroup?: string,
    @Query('campusName') campusName?: string
  ) {
    const fg = (facultyGroup ?? '').trim();
    const campus = (campusName ?? '').trim();
    if (!fg) {
      throw new BadRequestException('facultyGroup is required');
    }
    if (!campus) {
      throw new BadRequestException('campusName is required');
    }
    return this.sectionsService.listCourseFilters({
      facultyGroup: fg,
      campusName: campus,
    });
  }

  @Get(':id/courses')
  listCoursesBySection(@Param('id') id: string) {
    return this.sectionsService.listCoursesBySection(id);
  }

  @Get(':id/students')
  listStudents(@Param('id') id: string, @Query('courseName') courseName?: string) {
    return this.sectionsService.listStudents(id, (courseName ?? '').trim());
  }

  @Post()
  async create(@Body() dto: CreateSectionDto) {
    const section = await this.sectionsService.create(dto);
    return {
      id: section.id,
      name: section.name,
      code: section.code,
      akademicSectionId: section.akademicSectionId,
      facultyGroup: section.facultyGroup,
      facultyName: section.facultyName,
      campusName: section.campusName,
      modality: section.modality,
      initialCapacity: section.initialCapacity,
      maxExtraCapacity: section.maxExtraCapacity,
      isAutoLeveling: section.isAutoLeveling,
      teacherId: section.teacher?.id ?? null,
      teacherDni: section.teacher?.dni ?? null,
      teacherName: section.teacher?.fullName ?? null,
    };
  }

  @Patch(':id/capacity')
  async updateCapacity(
    @Param('id') id: string,
    @Body() dto: UpdateSectionCapacityDto
  ) {
    const section = await this.sectionsService.updateCapacity({
      id,
      initialCapacity: dto.initialCapacity,
      maxExtraCapacity: dto.maxExtraCapacity,
    });
    return {
      id: section.id,
      name: section.name,
      initialCapacity: section.initialCapacity,
      maxExtraCapacity: section.maxExtraCapacity,
    };
  }

  @Patch(':id/teacher')
  async assignTeacher(@Param('id') id: string, @Body() dto: AssignSectionTeacherDto) {
    const section = await this.sectionsService.assignTeacher({
      id,
      teacherId: dto.teacherId ?? null,
    });
    return {
      id: section.id,
      teacherId: section.teacher?.id ?? null,
      teacherDni: section.teacher?.dni ?? null,
      teacherName: section.teacher?.fullName ?? null,
    };
  }

  @Patch(':id/course-teacher')
  assignTeacherByCourse(
    @Param('id') sectionId: string,
    @Body() dto: AssignSectionCourseTeacherDto
  ) {
    return this.sectionsService.assignTeacherByCourse({
      sectionId,
      courseName: dto.courseName,
      teacherId: dto.teacherId ?? null,
    });
  }
}
