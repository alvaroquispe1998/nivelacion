import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  dni!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  codigoAlumno?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;
}

