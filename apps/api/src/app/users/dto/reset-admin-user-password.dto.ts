import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetAdminUserPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  newPassword!: string;
}
