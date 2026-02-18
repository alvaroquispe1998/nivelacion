import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTeacherDto {
  @IsString()
  @Matches(/^\d{8,15}$/)
  dni!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  password!: string;
}
