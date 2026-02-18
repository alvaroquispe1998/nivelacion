import { IsOptional, IsUUID } from 'class-validator';

export class AssignSectionTeacherDto {
  @IsOptional()
  @IsUUID()
  teacherId?: string | null;
}

