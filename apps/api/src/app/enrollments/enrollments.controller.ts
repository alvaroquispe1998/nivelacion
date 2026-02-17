import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BulkEnrollDto } from './dto/bulk-enroll.dto';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/sections/:id/enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('bulk')
  bulk(@Param('id') sectionId: string, @Body() dto: BulkEnrollDto) {
    return this.enrollmentsService.bulkEnroll(sectionId, dto.dnis);
  }
}

