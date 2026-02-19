import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

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
}
