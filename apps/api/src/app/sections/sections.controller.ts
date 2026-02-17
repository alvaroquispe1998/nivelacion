import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionCapacityDto } from './dto/update-section-capacity.dto';
import { SectionsService } from './sections.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  async list() {
    const sections = await this.sectionsService.list();
    return sections.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      akademicSectionId: s.akademicSectionId,
      facultyGroup: s.facultyGroup,
      facultyName: s.facultyName,
      campusName: s.campusName,
      modality: s.modality,
      initialCapacity: s.initialCapacity,
      maxExtraCapacity: s.maxExtraCapacity,
      isAutoLeveling: s.isAutoLeveling,
    }));
  }

  @Post()
  async create(@Body() dto: CreateSectionDto) {
    const section = await this.sectionsService.create(dto);
    return {
      id: section.id,
      name: section.name,
      code: section.code,
      akademicSectionId: section.akademicSectionId,
      facultyGroup: section.facultyGroup,
      facultyName: section.facultyName,
      campusName: section.campusName,
      modality: section.modality,
      initialCapacity: section.initialCapacity,
      maxExtraCapacity: section.maxExtraCapacity,
      isAutoLeveling: section.isAutoLeveling,
    };
  }

  @Patch(':id/capacity')
  async updateCapacity(
    @Param('id') id: string,
    @Body() dto: UpdateSectionCapacityDto
  ) {
    const section = await this.sectionsService.updateCapacity({
      id,
      initialCapacity: dto.initialCapacity,
      maxExtraCapacity: dto.maxExtraCapacity,
    });
    return {
      id: section.id,
      name: section.name,
      initialCapacity: section.initialCapacity,
      maxExtraCapacity: section.maxExtraCapacity,
    };
  }
}
