import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@uai/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ResetAdminUserPasswordDto } from './dto/reset-admin-user-password.dto';
import { UpdateAdminUserStatusDto } from './dto/update-admin-user-status.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UsersService } from './users.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    const rows = await this.usersService.listInternalUsers();
    return rows.map((row) => this.toResponse(row));
  }

  @Post()
  async create(@Body() dto: CreateAdminUserDto, @CurrentUser() user: JwtUser) {
    const created = await this.usersService.createInternalUser({
      dni: dto.dni,
      fullName: dto.fullName,
      role: dto.role,
      password: dto.password,
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
    return this.toResponse(created);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() user: JwtUser
  ) {
    const updated = await this.usersService.updateInternalUser(id, {
      dni: dto.dni,
      fullName: dto.fullName,
      role: dto.role,
      actor: {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      },
    });
    return this.toResponse(updated);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserStatusDto,
    @CurrentUser() user: JwtUser
  ) {
    const updated = await this.usersService.updateInternalStatus(
      id,
      dto.isActive,
      user.sub,
      {
        userId: String(user?.sub ?? '').trim() || null,
        fullName: String(user?.fullName ?? '').trim() || null,
        role: String(user?.role ?? '').trim() || null,
      }
    );
    return this.toResponse(updated);
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetAdminUserPasswordDto,
    @CurrentUser() user: JwtUser
  ) {
    await this.usersService.resetUserPasswordByAdmin(id, dto.newPassword, undefined, {
      userId: String(user?.sub ?? '').trim() || null,
      fullName: String(user?.fullName ?? '').trim() || null,
      role: String(user?.role ?? '').trim() || null,
    });
    return { ok: true };
  }

  private toResponse(row: {
    id: string;
    dni: string;
    fullName: string;
    role: Role;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: row.id,
      dni: row.dni,
      fullName: row.fullName,
      role: row.role,
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt?.toISOString() ?? undefined,
      updatedAt: row.updatedAt?.toISOString() ?? undefined,
    };
  }
}
