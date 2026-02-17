import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StudentService } from './student.service';

@ApiTags('student')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ALUMNO)
@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('schedule')
  schedule(@CurrentUser() user: JwtUser) {
    return this.studentService.getSchedule(user.sub);
  }

  @Get('attendance')
  attendance(@CurrentUser() user: JwtUser) {
    return this.studentService.getAttendance(user.sub);
  }
}
