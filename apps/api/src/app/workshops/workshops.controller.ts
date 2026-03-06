import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ADMIN_BACKOFFICE_ROLES } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkshopsService } from './workshops.service';

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
      studentIds?: string[];
    }
  ) {
    return this.workshopsService.create(body);
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
      studentIds?: string[];
    }>
  ) {
    return this.workshopsService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.workshopsService.delete(id);
  }

  @Get('students/list')
  listStudents(
    @Query('facultyGroup') facultyGroup?: string | string[],
    @Query('campusName') campusName?: string | string[],
    @Query('careerName') careerName?: string | string[]
  ) {
    return this.workshopsService.listStudents({ facultyGroup, campusName, careerName });
  }

  @Post(':id/preview')
  preview(@Param('id') id: string) {
    return this.workshopsService.preview(id);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string) {
    return this.workshopsService.apply(id);
  }
}
