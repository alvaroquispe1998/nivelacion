import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StudentService } from './student.service';
import { WorkshopsService } from '../workshops/workshops.service';

@ApiTags('student')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ALUMNO)
@Controller('student')
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly workshopsService: WorkshopsService
  ) {}

  @Get('schedule')
  async schedule(@CurrentUser() user: JwtUser) {
    const [courseItems, workshopItems] = await Promise.all([
      this.studentService.getSchedule(user.sub),
      this.workshopsService.listStudentScheduleItems(user.sub),
    ]);
    return [...courseItems, ...workshopItems].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courseName.localeCompare(b.courseName, 'es', { sensitivity: 'base' });
    });
  }

  @Get('attendance')
  async attendance(@CurrentUser() user: JwtUser) {
    const [courseItems, workshopItems] = await Promise.all([
      this.studentService.getAttendance(user.sub),
      this.workshopsService.listStudentWorkshopAttendance(user.sub),
    ]);
    return [...courseItems, ...workshopItems].sort((a, b) =>
      String(b.sessionDate ?? '').localeCompare(String(a.sessionDate ?? ''))
    );
  }

  @Get('courses')
  courses(@CurrentUser() user: JwtUser) {
    return this.studentService.listCourses(user.sub);
  }

  @Get('workshops')
  workshops(@CurrentUser() user: JwtUser) {
    return this.workshopsService.listStudentWorkshops(user.sub);
  }

  @Get('workshop-attendance')
  workshopAttendance(
    @CurrentUser() user: JwtUser,
    @Query('applicationGroupId') applicationGroupId?: string
  ) {
    return this.workshopsService.listStudentWorkshopAttendance(
      user.sub,
      applicationGroupId ?? null
    );
  }

  @Post('workshop-schedule-blocks/:id/refresh-join-link')
  refreshWorkshopJoinLink(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.workshopsService.refreshStudentWorkshopScheduleBlockJoinLink(user.sub, id);
  }
}
