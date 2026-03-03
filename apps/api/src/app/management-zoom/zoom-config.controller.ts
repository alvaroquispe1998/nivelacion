import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateZoomConfigDto } from './dto/update-zoom-config.dto';
import { CreateHostGroupDto } from './dto/create-host-group.dto';
import { CreateHostDto } from './dto/create-host.dto';
import { ZoomService } from './zoom.service';
import { MeetingsService } from './meetings.service';

@ApiTags('admin / zoom')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/zoom/config')
export class ZoomConfigController {
  constructor(
    private readonly zoomService: ZoomService,
    private readonly meetingsService: MeetingsService,
  ) {}

  // ── Credentials ─────────────────────────────────────────────────────────

  /** GET /api/admin/zoom/config — Returns current config (secret masked) */
  @Get()
  async getConfig() {
    const config = await this.zoomService.getOrCreateConfig();
    return {
      ...config,
      clientSecret: config.clientSecret ? '••••••••' : '',
    };
  }

  /** PUT /api/admin/zoom/config — Save credentials */
  @Put()
  async updateConfig(@Body() dto: UpdateZoomConfigDto) {
    const saved = await this.zoomService.saveConfig({
      accountId: dto.accountId,
      clientId: dto.clientId,
      clientSecret: dto.clientSecret,
      maxConcurrent: dto.maxConcurrent,
      pageSize: dto.pageSize,
      timezone: dto.timezone,
    });
    return { ...saved, clientSecret: '••••••••' };
  }

  /** GET /api/admin/zoom/config/test — Test Zoom OAuth */
  @Get('test')
  testConnection() {
    return this.zoomService.testConnection();
  }

  // ── Host Groups ─────────────────────────────────────────────────────────

  /** GET /api/admin/zoom/config/host-groups — List groups with hosts */
  @Get('host-groups')
  listGroups() {
    return this.meetingsService.listGroups();
  }

  /** POST /api/admin/zoom/config/host-groups — Create group */
  @Post('host-groups')
  createGroup(@Body() dto: CreateHostGroupDto) {
    return this.meetingsService.createGroup(dto.name);
  }

  /** PATCH /api/admin/zoom/config/host-groups/:id — Update group */
  @Patch('host-groups/:id')
  updateGroup(
    @Param('id') id: string,
    @Body() body: { name?: string; status?: 'ACTIVO' | 'INACTIVO' },
  ) {
    return this.meetingsService.updateGroup(id, body);
  }

  /** DELETE /api/admin/zoom/config/host-groups/:id — Delete group */
  @Delete('host-groups/:id')
  deleteGroup(@Param('id') id: string) {
    return this.meetingsService.deleteGroup(id);
  }

  // ── Hosts ───────────────────────────────────────────────────────────────

  /** POST /api/admin/zoom/config/host-groups/:groupId/hosts — Add host */
  @Post('host-groups/:groupId/hosts')
  addHost(
    @Param('groupId') groupId: string,
    @Body() dto: CreateHostDto,
  ) {
    return this.meetingsService.addHost(groupId, dto.email);
  }

  /** PATCH /api/admin/zoom/config/hosts/:id — Update host */
  @Patch('hosts/:id')
  updateHost(
    @Param('id') id: string,
    @Body() body: { email?: string; status?: 'ACTIVO' | 'INACTIVO' },
  ) {
    return this.meetingsService.updateHost(id, body);
  }

  /** DELETE /api/admin/zoom/config/hosts/:id — Delete host */
  @Delete('hosts/:id')
  deleteHost(@Param('id') id: string) {
    return this.meetingsService.deleteHost(id);
  }
}
