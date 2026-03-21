import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditService } from './audit.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('facets')
  getFacets() {
    return this.auditService.getFacets();
  }

  @Get('changes')
  listChanges(
    @Query('moduleName') moduleName?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('batchId') batchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.auditService.listChanges({
      moduleName: moduleName ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      actorUserId: actorUserId ?? null,
      action: action ?? null,
      batchId: batchId ?? null,
      from: from ?? null,
      to: to ?? null,
      page: page ? Number(page) : null,
      pageSize: pageSize ? Number(pageSize) : null,
    });
  }
}
