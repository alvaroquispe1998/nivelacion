import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignSectionCourseTeacherDto {
  @IsString()
  @IsNotEmpty()
  courseName!: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string | null;
}
