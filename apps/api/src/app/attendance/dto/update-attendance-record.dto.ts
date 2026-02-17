import { AttendanceStatus } from '@uai/shared';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAttendanceRecordDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

