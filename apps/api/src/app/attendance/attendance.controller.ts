import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/attendance-sessions')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  async create(@Body() dto: CreateAttendanceSessionDto, @CurrentUser() user: JwtUser) {
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

  @Get()
  list(@Query('sectionId') sectionId?: string) {
    if (!sectionId) return [];
    return this.attendanceService.listSessionsBySection(sectionId);
  }

  @Get(':id/records')
  records(@Param('id') id: string) {
    return this.attendanceService.getRecords(id);
  }

  @Put(':id/records')
  update(
    @Param('id') id: string,
    @Body() body: UpdateAttendanceRecordDto[],
    @CurrentUser() user: JwtUser
  ) {
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
}
