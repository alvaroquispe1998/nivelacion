import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateScheduleBlockDto {
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @IsString()
  @IsNotEmpty()
  courseName!: string;

  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Matches(/^([01]\d|2[0-3]):(00|30)$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):(00|30)$/)
  endTime!: string;

  @IsOptional()
  @IsString()
  zoomUrl?: string;

  @IsOptional()
  @IsString()
  location?: string;
}

