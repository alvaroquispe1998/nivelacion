import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  usuario!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  newPassword!: string;
}

