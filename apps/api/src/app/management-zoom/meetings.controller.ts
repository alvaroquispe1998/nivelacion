import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingsService } from './meetings.service';

@ApiTags('admin / zoom')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/zoom/meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  /** POST /api/admin/zoom/meetings/auto — Create with smart host selection */
  @Post('auto')
  createAuto(@Body() dto: CreateMeetingDto) {
    return this.meetingsService.createAutoMeeting({
      topic: dto.topic,
      agenda: dto.agenda,
      startTime: dto.start_time,
      endTime: dto.end_time,
      timezone: dto.timezone,
      groupId: dto.groupId,
      periodId: dto.periodId,
    });
  }

  /** GET /api/admin/zoom/meetings — List meetings */
  @Get()
  list(
    @Query('host_emails') hostEmails?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.meetingsService.listMeetings({
      hostEmails,
      from,
      to,
      periodId,
    });
  }

  /** GET /api/admin/zoom/meetings/by-topic — Search by topic */
  @Get('by-topic')
  searchByTopic(
    @Query('topic') topic: string,
    @Query('limit') limit?: string,
  ) {
    return this.meetingsService.searchByTopic(
      topic,
      Number(limit) || 20,
    );
  }

  /** GET /api/admin/zoom/meetings/recordings — List recordings */
  @Get('recordings')
  recordings(
    @Query('host_emails') hostEmails?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.meetingsService.listRecordings({
      hostEmails,
      from: from ?? '',
      to: to ?? '',
    });
  }

  /** GET /api/admin/zoom/meetings/users/licensed — Licensed Zoom users */
  @Get('users/licensed')
  licensedUsers() {
    return this.meetingsService.listLicensedUsers();
  }

  /** DELETE /api/admin/zoom/meetings/:id — Delete a meeting */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.meetingsService.deleteMeeting(id);
  }
}
