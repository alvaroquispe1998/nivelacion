import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateScheduleBlockDto {
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @IsOptional()
  @IsUUID()
  sectionCourseId?: string;

  @IsString()
  @IsNotEmpty()
  courseName!: string;

  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be HH:mm',
  })
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be HH:mm',
  })
  endTime!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsString()
  zoomUrl?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
