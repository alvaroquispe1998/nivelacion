import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AkademicService } from './akademic.service';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('integrations/akademic')
export class AkademicController {
  constructor(private readonly akademicService: AkademicService) {}

  @Get('secciones')
  secciones(@Query('courseId') courseId?: string) {
    return this.akademicService.getSecciones(courseId);
  }
}

