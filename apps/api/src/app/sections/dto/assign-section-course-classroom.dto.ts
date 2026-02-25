import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignSectionCourseClassroomDto {
  @IsString()
  courseName!: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;
}
