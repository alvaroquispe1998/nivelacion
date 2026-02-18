import {
  Body,
  Controller,
  Get,
  Post,
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
import { UpdateLevelingConfigDto } from './dto/update-leveling-config.dto';
import { LevelingService } from './leveling.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/leveling')
export class LevelingController {
  constructor(private readonly levelingService: LevelingService) {}

  @Get('config')
  getConfig() {
    return this.levelingService.getConfig();
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
    @Body() dto: LevelingPlanDto
  ) {
    return this.levelingService.planFromExcel({
      fileBuffer: file?.buffer,
      initialCapacity: dto.initialCapacity,
      maxExtraCapacity: dto.maxExtraCapacity,
      apply: dto.apply,
      groupModalityOverrides: dto.groupModalityOverrides,
    });
  }
}
