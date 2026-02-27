import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GradesService } from './grades.service';

@ApiTags('student')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ALUMNO)
@Controller('student/grades')
export class StudentGradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Get()
  getGrades(@CurrentUser() user: JwtUser) {
    return this.gradesService.getStudentGrades(user.sub);
  }
}

