import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateAttendanceSessionDto {
  @IsString()
  @IsNotEmpty()
  scheduleBlockId!: string;

  // YYYY-MM-DD
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  sessionDate!: string;
}

