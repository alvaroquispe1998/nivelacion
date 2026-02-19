import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LevelingPlanDto } from './dto/leveling-plan.dto';
import { CreateLevelingManualSectionCourseDto } from './dto/create-leveling-manual-section-course.dto';
import { UpdateLevelingConfigDto } from './dto/update-leveling-config.dto';
import { LevelingService } from './leveling.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/leveling')
export class LevelingController {
  constructor(private readonly levelingService: LevelingService) { }

  @Get('config')
  getConfig() {
    return this.levelingService.getConfig();
  }

  @Get('active-run-summary')
  getActiveRunSummary() {
    return this.levelingService.getActiveRunSummary();
  }

  @Put('config')
  updateConfig(@Body() dto: UpdateLevelingConfigDto) {
    return this.levelingService.updateConfig({
      initialCapacity: dto.initialCapacity,
      maxExtraCapacity: dto.maxExtraCapacity,
    });
  }

  @Post('plan')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  plan(
    @UploadedFile() file: any,
    @Body() dto: LevelingPlanDto,
    @Req() req: any
  ) {
    return this.levelingService.planFromExcel({
      fileBuffer: file?.buffer,
      initialCapacity: dto.initialCapacity,
      maxExtraCapacity: dto.maxExtraCapacity,
      apply: dto.apply,
      groupModalityOverrides: dto.groupModalityOverrides,
      createdById: String(req?.user?.id ?? '').trim() || null,
    });
  }

  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.levelingService.getRunDetails(runId);
  }

  @Get('runs/:runId/sections')
  listRunSections(@Param('runId') runId: string) {
    return this.levelingService.listRunSections(runId);
  }

  @Post('runs/:runId/manual-section-courses')
  createManualSectionCourse(
    @Param('runId') runId: string,
    @Body() dto: CreateLevelingManualSectionCourseDto
  ) {
    return this.levelingService.createManualSectionCourse(runId, dto);
  }

  @Delete('runs/:runId/manual-section-courses/:sectionCourseId')
  deleteManualSectionCourse(
    @Param('runId') runId: string,
    @Param('sectionCourseId') sectionCourseId: string
  ) {
    return this.levelingService.deleteManualSectionCourse(runId, sectionCourseId);
  }

  @Post('runs/:runId/matriculate')
  matriculateRun(
    @Param('runId') runId: string,
    @Body() body: { facultyGroup?: string }
  ) {
    return this.levelingService.matriculateRun(runId, body?.facultyGroup);
  }

  @Get('runs/:runId/matriculate-preview')
  getRunMatriculationPreview(
    @Param('runId') runId: string,
    @Query('facultyGroup') facultyGroup?: string
  ) {
    return this.levelingService.getRunMatriculationPreview(runId, facultyGroup);
  }

  @Get('runs/:runId/conflicts')
  listRunConflicts(
    @Param('runId') runId: string,
    @Query('facultyGroup') facultyGroup?: string,
    @Query('campusName') campusName?: string
  ) {
    return this.levelingService.listRunScheduleConflicts({
      runId,
      facultyGroup: String(facultyGroup ?? '').trim(),
      campusName: String(campusName ?? '').trim(),
    });
  }
}
