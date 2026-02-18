import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{8,15}$/)
  dni?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  password?: string;
}
