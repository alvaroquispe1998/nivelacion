import { Role } from '@uai/shared';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAdminUserDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9]{3,30}$/)
  dni!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  fullName!: string;

  @IsIn([Role.ADMIN, Role.ADMINISTRATIVO, Role.SOPORTE_TECNICO])
  role!: Role.ADMIN | Role.ADMINISTRATIVO | Role.SOPORTE_TECNICO;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;
}
