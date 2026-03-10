import { Role } from '@uai/shared';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]{3,30}$/)
  dni?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsIn([Role.ADMIN, Role.ADMINISTRATIVO, Role.SOPORTE_TECNICO])
  role?: Role.ADMIN | Role.ADMINISTRATIVO | Role.SOPORTE_TECNICO;
}
