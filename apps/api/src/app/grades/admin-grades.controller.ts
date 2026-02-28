import {
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
import { Role } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminStudentReportSearchDto } from './dto/reports.dto';
import { GradesReportFilterDto, SaveSectionCourseGradesDto } from './dto/save-section-course-grades.dto';
import { UpdateGradeSchemeDto } from './dto/update-grade-scheme.dto';
import { GradesService } from './grades.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/grades')
export class AdminGradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Get('scheme')
  getScheme() {
    return this.gradesService.getAdminScheme();
  }

  @Put('scheme')
  updateScheme(@Body() dto: UpdateGradeSchemeDto) {
    return this.gradesService.updateAdminScheme(dto);
  }

  @Get('section-courses')
  listSectionCourses(
    @Query('facultyGroup') facultyGroup?: string,
    @Query('campusName') campusName?: string,
    @Query('courseName') courseName?: string
  ) {
    return this.gradesService.listSectionCoursesForAdmin({
      facultyGroup: String(facultyGroup ?? '').trim() || undefined,
      campusName: String(campusName ?? '').trim() || undefined,
      courseName: String(courseName ?? '').trim() || undefined,
    });
  }

  @Get('section-courses/:sectionCourseId')
  getSectionCourseGrades(@Param('sectionCourseId') sectionCourseId: string) {
    return this.gradesService.getSectionCourseGradesForAdmin(sectionCourseId);
  }

  @Put('section-courses/:sectionCourseId')
  saveSectionCourseGrades(
    @Param('sectionCourseId') sectionCourseId: string,
    @Body() dto: SaveSectionCourseGradesDto,
    @CurrentUser() user: JwtUser
  ) {
    return this.gradesService.saveSectionCourseGradesForAdmin(
      sectionCourseId,
      dto,
      user.sub
    );
  }

  @Post('section-courses/:sectionCourseId/publish')
  publishSectionCourseGrades(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.gradesService.publishSectionCourseGradesForAdmin(
      sectionCourseId,
      user.sub
    );
  }

  @Get('reports/filters')
  getReportFilters() {
    return this.gradesService.getAdminReportFilters();
  }

  @Get('reports/student-search')
  searchStudentsForReport(@Query() query: AdminStudentReportSearchDto) {
    return this.gradesService.searchAdminStudentsForReport(query.q);
  }

  @Get('reports/student/:studentId')
  getStudentReport(@Param('studentId') studentId: string) {
    return this.gradesService.getAdminStudentReport(studentId);
  }

  @Get('reports/student/:studentId/export/excel')
  async exportStudentReportExcel(
    @Param('studentId') studentId: string
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminStudentReportExcel(studentId);
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('reports/student/:studentId/export/pdf')
  async exportStudentReportPdf(
    @Param('studentId') studentId: string
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminStudentReportPdf(studentId);
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('reports/students')
  getStudentsReport(@Query() query: GradesReportFilterDto) {
    return this.gradesService.getAdminStudentsReport(query);
  }

  @Get('reports/students/export/excel')
  async exportStudentsReportExcel(
    @Query() query: GradesReportFilterDto
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminStudentsReportExcel(query);
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('reports/students/export/pdf')
  async exportStudentsReportPdf(
    @Query() query: GradesReportFilterDto
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminStudentsReportPdf(query);
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('reports/averages')
  getAveragesReport(@Query() query: GradesReportFilterDto) {
    return this.gradesService.getAdminAveragesReport(query);
  }

  @Get('reports/averages/export/excel')
  async exportAveragesReportExcel(
    @Query() query: GradesReportFilterDto
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminAveragesReportExcel(query);
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('reports/averages/export/pdf')
  async exportAveragesReportPdf(
    @Query() query: GradesReportFilterDto
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminAveragesReportPdf(query);
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('reports/attendance')
  getAttendanceReport(@Query() query: GradesReportFilterDto) {
    return this.gradesService.getAdminAttendanceReport(query);
  }

  @Get('reports/attendance/export/excel')
  async exportAttendanceReportExcel(
    @Query() query: GradesReportFilterDto
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminAttendanceReportExcel(query);
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('reports/attendance/export/pdf')
  async exportAttendanceReportPdf(
    @Query() query: GradesReportFilterDto
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildAdminAttendanceReportPdf(query);
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
