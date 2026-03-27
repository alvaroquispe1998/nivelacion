import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
import { SaveSectionCourseGradesDto } from './dto/save-section-course-grades.dto';
import { GradesService } from './grades.service';

@ApiTags('teacher')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCENTE)
@Controller('teacher/grades')
export class TeacherGradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Get('section-courses/:sectionCourseId')
  getSectionCourseGrades(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.gradesService.getSectionCourseGradesForTeacher(sectionCourseId, user.sub);
  }

  @Put('section-courses/:sectionCourseId')
  saveSectionCourseGrades(
    @Param('sectionCourseId') sectionCourseId: string,
    @Body() dto: SaveSectionCourseGradesDto,
    @CurrentUser() user: JwtUser
  ) {
    return this.gradesService.saveSectionCourseGradesForTeacher(
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
    return this.gradesService.publishSectionCourseGradesForTeacher(
      sectionCourseId,
      user.sub
    );
  }

  @Get('section-courses/:sectionCourseId/export/consolidated/pdf')
  async exportSectionCourseConsolidatedPdf(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildTeacherSectionCourseConsolidatedPdf(
        sectionCourseId,
        user.sub
      );
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('section-courses/:sectionCourseId/export/consolidated/excel')
  async exportSectionCourseConsolidatedExcel(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildTeacherSectionCourseConsolidatedExcel(
        sectionCourseId,
        user.sub
      );
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('section-courses/:sectionCourseId/export/official-record/pdf')
  async exportSectionCourseOfficialRecordPdf(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildTeacherSectionCourseOfficialRecordPdf(
        sectionCourseId,
        user.sub
      );
    return new StreamableFile(fileBuffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('section-courses/:sectionCourseId/export/official-record/excel')
  async exportSectionCourseOfficialRecordExcel(
    @Param('sectionCourseId') sectionCourseId: string,
    @CurrentUser() user: JwtUser
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.gradesService.buildTeacherSectionCourseOfficialRecordExcel(
        sectionCourseId,
        user.sub
      );
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
