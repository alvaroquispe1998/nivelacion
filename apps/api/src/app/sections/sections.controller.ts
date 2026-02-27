import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
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
import { AssignSectionCourseClassroomDto } from './dto/assign-section-course-classroom.dto';
import { AssignSectionTeacherDto } from './dto/assign-section-teacher.dto';
import { BulkApplyFromMotherDto } from './dto/bulk-apply-from-mother.dto';
import { ReassignStudentSectionCourseDto } from './dto/reassign-student-section-course.dto';
import { UpdateSectionCapacityDto } from './dto/update-section-capacity.dto';
import { UpdateSectionCourseCapacityDto } from './dto/update-section-course-capacity.dto';
import { UpdateSectionCourseCapacityByCourseNameDto } from './dto/update-section-course-capacity-by-course-name.dto';
import { SectionsService } from './sections.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) { }

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
        classroomId: (row as any).classroomId ?? null,
        classroomCode: (row as any).classroomCode ?? null,
        classroomName: (row as any).classroomName ?? null,
        classroomCapacity: (row as any).classroomCapacity ?? null,
        classroomPavilionCode: (row as any).classroomPavilionCode ?? null,
        classroomPavilionName: (row as any).classroomPavilionName ?? null,
        classroomLevelName: (row as any).classroomLevelName ?? null,
        capacitySource: (row as any).capacitySource ?? null,
        planningStatus: (row as any).planningStatus ?? null,
        planningStatusLabel: (row as any).planningStatusLabel ?? null,
        hasClassroomConflict: Boolean((row as any).hasClassroomConflict),
        hasTeacherConflict: Boolean((row as any).hasTeacherConflict),
        availableSeats:
          (row as any).availableSeats !== null && (row as any).availableSeats !== undefined
            ? Number((row as any).availableSeats)
            : null,
        isMotherSection: Boolean((row as any).isMotherSection),
      };
    });
  }

  @Get('filters/faculties')
  listFaculties() {
    return this.sectionsService.listFacultyFilters();
  }

  @Get('filters/faculties-detailed')
  listFacultiesDetailed() {
    return this.sectionsService.listFacultyFiltersDetailed();
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
  reassignStudentSectionCourse(
    @Body() dto: ReassignStudentSectionCourseDto,
    @Req() req: any
  ) {
    return this.sectionsService.reassignStudentSectionCourse({
      studentId: dto.studentId,
      fromSectionCourseId: dto.fromSectionCourseId,
      toSectionCourseId: dto.toSectionCourseId,
      confirmOverCapacity: Boolean(dto.confirmOverCapacity),
      reason: String(dto.reason ?? '').trim() || null,
      changedBy: String(req?.user?.id ?? '').trim() || null,
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

  @Get('stats/course-progress')
  getCourseScopeProgress(
    @Query('facultyGroup') facultyGroup?: string,
    @Query('campusName') campusName?: string,
    @Query('courseName') courseName?: string
  ) {
    const fg = String(facultyGroup ?? '').trim();
    const campus = String(campusName ?? '').trim();
    const course = String(courseName ?? '').trim();
    if (!fg || !campus || !course) {
      throw new BadRequestException(
        'facultyGroup, campusName y courseName son requeridos'
      );
    }
    return this.sectionsService.getCourseScopeProgress({
      facultyGroup: fg,
      campusName: campus,
      courseName: course,
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

  @Get(':id/students/export/excel')
  async exportSectionCourseStudentsExcel(
    @Param('id') id: string,
    @Query('courseName') courseName?: string
  ): Promise<StreamableFile> {
    const normalizedCourseName = String(courseName ?? '').trim();
    if (!normalizedCourseName) {
      throw new BadRequestException('courseName query param is required');
    }
    const { fileBuffer, fileName } =
      await this.sectionsService.buildSectionCourseStudentsExportWorkbook(
        id,
        normalizedCourseName
      );
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get(':id/students/export/pdf')
  async exportSectionCourseStudentsPdf(
    @Param('id') id: string,
    @Query('courseName') courseName?: string
  ): Promise<StreamableFile> {
    const normalizedCourseName = String(courseName ?? '').trim();
    if (!normalizedCourseName) {
      throw new BadRequestException('courseName query param is required');
    }
    const { fileBuffer, fileName } = await this.sectionsService.buildSectionCourseStudentsExportPdf(
      id,
      normalizedCourseName
    );
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
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

  @Patch('section-courses/:sectionCourseId/capacity')
  async updateSectionCourseCapacity(
    @Param('sectionCourseId') sectionCourseId: string,
    @Body() dto: UpdateSectionCourseCapacityDto
  ) {
    return this.sectionsService.updateSectionCourseCapacity({
      sectionCourseId,
      initialCapacity: dto.initialCapacity,
      maxExtraCapacity: dto.maxExtraCapacity,
    });
  }

  @Get(':id/course-capacity')
  async getCourseCapacity(
    @Param('id') sectionId: string,
    @Query('courseName') courseName?: string
  ) {
    if (!courseName?.trim()) {
      throw new BadRequestException('courseName query param is required');
    }
    return this.sectionsService.getCourseCapacityBySectionAndCourseName(sectionId, courseName.trim());
  }

  @Patch(':id/course-capacity')
  async updateCourseCapacityByCourseName(
    @Param('id') sectionId: string,
    @Body() dto: UpdateSectionCourseCapacityByCourseNameDto
  ) {
    return this.sectionsService.updateCourseCapacityBySectionAndCourseName({
      sectionId,
      courseName: dto.courseName,
      initialCapacity: dto.initialCapacity,
      maxExtraCapacity: dto.maxExtraCapacity,
    });
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

  @Post('course-teacher/bulk-apply-from-mother')
  bulkApplyCourseTeacherFromMother(@Body() dto: BulkApplyFromMotherDto) {
    return this.sectionsService.bulkApplyCourseTeacherFromMother({
      facultyGroup: dto.facultyGroup,
      campusName: dto.campusName,
      courseName: dto.courseName,
      modality: dto.modality ?? null,
    });
  }

  @Post('course-schedule/bulk-apply-from-mother')
  bulkApplyCourseScheduleFromMother(@Body() dto: BulkApplyFromMotherDto) {
    return this.sectionsService.bulkApplyCourseScheduleFromMother({
      facultyGroup: dto.facultyGroup,
      campusName: dto.campusName,
      courseName: dto.courseName,
      modality: dto.modality ?? null,
    });
  }

  @Patch(':id/course-classroom')
  assignClassroomByCourse(
    @Param('id') sectionId: string,
    @Body() dto: AssignSectionCourseClassroomDto
  ) {
    return this.sectionsService.assignClassroomByCourse({
      sectionId,
      courseName: dto.courseName,
      classroomId: dto.classroomId ?? null,
    });
  }
}
