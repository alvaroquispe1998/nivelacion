import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
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
}

