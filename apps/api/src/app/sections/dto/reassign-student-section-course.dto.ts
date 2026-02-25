import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ReassignStudentSectionCourseDto {
  @IsUUID()
  @IsNotEmpty()
  studentId!: string;

  @IsUUID()
  @IsNotEmpty()
  fromSectionCourseId!: string;

  @IsUUID()
  @IsNotEmpty()
  toSectionCourseId!: string;

  @IsOptional()
  @IsBoolean()
  confirmOverCapacity?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
