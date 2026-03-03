import { Role } from '@uai/shared';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{8,15}$/)
  dni?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsIn([Role.ADMIN, Role.ADMINISTRATIVO])
  role?: Role.ADMIN | Role.ADMINISTRATIVO;
}
