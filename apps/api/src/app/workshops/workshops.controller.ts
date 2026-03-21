import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ADMIN_BACKOFFICE_ROLES } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkshopsService } from './workshops.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_BACKOFFICE_ROLES)
@Controller('admin/workshops')
export class WorkshopsController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  @Get()
  list() {
    return this.workshopsService.list();
  }

  @Get('filters')
  listFilters(
    @Query('facultyGroup') facultyGroup?: string | string[],
    @Query('campusName') campusName?: string | string[]
  ) {
    return this.workshopsService.listFilters({ facultyGroup, campusName });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workshopsService.get(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      mode: 'BY_SIZE' | 'SINGLE';
      groupSize?: number;
      selectionMode: 'ALL' | 'MANUAL';
      facultyGroups?: string[];
      campusNames?: string[];
      careerNames?: string[];
      facultyGroup?: string;
      campusName?: string;
      careerName?: string;
      deliveryMode?: 'VIRTUAL' | 'PRESENCIAL';
      venueCampusName?: string;
      responsibleTeacherId?: string | null;
      studentIds?: string[];
    },
    @CurrentUser() user: JwtUser
  ) {
    return this.workshopsService.create(body, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<{
      name: string;
      mode: 'BY_SIZE' | 'SINGLE';
      groupSize?: number;
      selectionMode: 'ALL' | 'MANUAL';
      facultyGroups?: string[];
      campusNames?: string[];
      careerNames?: string[];
      facultyGroup?: string;
      campusName?: string;
      careerName?: string;
      deliveryMode?: 'VIRTUAL' | 'PRESENCIAL';
      venueCampusName?: string;
      responsibleTeacherId?: string | null;
      studentIds?: string[];
    }>,
    @CurrentUser() user: JwtUser
  ) {
    return this.workshopsService.update(id, body, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean },
    @CurrentUser() user: JwtUser
  ) {
    if (typeof body?.isActive !== 'boolean') {
      throw new BadRequestException('isActive es requerido');
    }
    return this.workshopsService.updateStatus(id, body.isActive, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.workshopsService.delete(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Get('students/list')
  listStudents(
    @Query('facultyGroup') facultyGroup?: string | string[],
    @Query('campusName') campusName?: string | string[],
    @Query('careerName') careerName?: string | string[]
  ) {
    return this.workshopsService.listStudents({ facultyGroup, campusName, careerName });
  }

  @Post('students/import-codes')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  importStudentCodes(@UploadedFile() file: any) {
    return this.workshopsService.importStudentCodesFromExcel({
      buffer: file?.buffer,
      originalname: file?.originalname,
    });
  }

  @Get(':id/groups')
  listGroups(@Param('id') id: string) {
    return this.workshopsService.listGroups(id);
  }

  @Put(':id/groups')
  upsertGroups(
    @Param('id') id: string,
    @Body()
    body: {
      groups: Array<{
        id?: string;
        code?: string | null;
        displayName: string;
        capacity?: number | null;
        sortOrder?: number;
        isActive?: boolean;
      }>;
    },
    @CurrentUser() user: JwtUser
  ) {
    return this.workshopsService.upsertGroups(id, body?.groups ?? [], {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Post(':id/groups/regenerate')
  regenerateGroups(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.workshopsService.regenerateGroups(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Get(':id/groups/:groupId/schedule')
  listGroupSchedule(@Param('id') id: string, @Param('groupId') groupId: string) {
    return this.workshopsService.listGroupSchedule(id, groupId);
  }

  @Put(':id/groups/:groupId/schedule')
  updateGroupSchedule(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body()
    body: {
      blocks: Array<{
        id?: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        startDate?: string | null;
        endDate?: string | null;
        zoomMeetingRecordId?: string | null;
        joinUrl?: string | null;
        startUrl?: string | null;
      }>;
      forceConflicts?: boolean;
    },
    @CurrentUser() user: JwtUser
  ) {
    return this.workshopsService.updateGroupSchedule(id, groupId, body?.blocks ?? [], {
      forceConflicts: Boolean(body?.forceConflicts),
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
  }

  @Put(':id/groups/:groupId/schedule/:blockId/meeting-links')
  updateGroupScheduleBlockMeetingLinks(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Param('blockId') blockId: string,
    @Body()
    body: {
      zoomMeetingRecordId?: string | null;
      joinUrl?: string | null;
      startUrl?: string | null;
    },
    @CurrentUser() user: JwtUser
  ) {
    return this.workshopsService.updateGroupScheduleBlockMeetingLinks(id, groupId, blockId, body, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Post(':id/groups/:groupId/schedule/:blockId/refresh-meeting-links')
  refreshGroupScheduleBlockMeetingLinks(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Param('blockId') blockId: string
  ) {
    return this.workshopsService.refreshWorkshopGroupScheduleBlockLinksForAdmin(
      id,
      groupId,
      blockId
    );
  }

  @Post(':id/assignments/preview')
  previewAssignments(@Param('id') id: string) {
    return this.workshopsService.previewAssignments(id);
  }

  @Post(':id/assignments/run')
  runAssignments(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.workshopsService.runAssignments(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }

  @Get(':id/assignments/:runId')
  getAssignmentRun(@Param('id') id: string, @Param('runId') runId: string) {
    return this.workshopsService.getAssignmentRun(id, runId);
  }

  @Get(':id/assignments/latest/applied-view')
  getLatestAppliedView(@Param('id') id: string) {
    return this.workshopsService.getLatestAppliedView(id);
  }

  @Get(':id/assignments/:runId/students/:studentId/group-options')
  getAssignmentRunStudentGroupOptions(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Param('studentId') studentId: string
  ) {
    return this.workshopsService.getAssignmentRunStudentGroupOptions(
      id,
      runId,
      studentId
    );
  }

  @Post(':id/assignments/:runId/students/:studentId/change-group')
  changeAssignmentRunStudentGroup(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Param('studentId') studentId: string,
    @Body() body: { targetRunGroupId: string }
  ) {
    return this.workshopsService.changeAssignmentRunStudentGroup(id, runId, studentId, {
      targetRunGroupId: body?.targetRunGroupId,
    });
  }

  @Get(':id/assignments/:runId/pending')
  getAssignmentRunPending(@Param('id') id: string, @Param('runId') runId: string) {
    return this.workshopsService.getAssignmentRunPending(id, runId);
  }

  @Get(':id/export/groups/excel')
  async exportLatestAppliedGroupsExcel(
    @Param('id') id: string
  ): Promise<StreamableFile> {
    const { fileBuffer, fileName } =
      await this.workshopsService.buildLatestAppliedGroupsExportWorkbook(id);
    return new StreamableFile(fileBuffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Post(':id/preview')
  preview(@Param('id') id: string) {
    return this.workshopsService.preview(id);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.workshopsService.apply(id, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
  }
}
