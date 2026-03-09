import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateMeetingRecurrenceDto {
  @IsString()
  @IsIn(['WEEKLY'])
  type!: 'WEEKLY';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  repeat_interval!: number;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekly_days!: number[];

  @IsString()
  @IsIn(['UNTIL_DATE', 'BY_COUNT'])
  end_mode!: 'UNTIL_DATE' | 'BY_COUNT';

  @ValidateIf((value: CreateMeetingRecurrenceDto) => value.end_mode === 'UNTIL_DATE')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  end_date?: string;

  @ValidateIf((value: CreateMeetingRecurrenceDto) => value.end_mode === 'BY_COUNT')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  end_times?: number;
}

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @IsOptional()
  @IsString()
  agenda?: string;

  @IsString()
  @IsNotEmpty()
  start_time!: string;

  @IsString()
  @IsNotEmpty()
  end_time!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ONE_TIME', 'RECURRING'])
  meeting_mode?: 'ONE_TIME' | 'RECURRING';

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMeetingRecurrenceDto)
  recurrence?: CreateMeetingRecurrenceDto;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  periodId?: string;
}
