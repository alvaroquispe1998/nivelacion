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
  @Matches(/^\d{8,15}$/)
  dni!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  fullName!: string;

  @IsIn([Role.ADMIN, Role.ADMINISTRATIVO])
  role!: Role.ADMIN | Role.ADMINISTRATIVO;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;
}
