import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateLevelingManualSectionCourseDto {
  @IsString()
  @IsNotEmpty()
  facultyGroup!: string;

  @IsOptional()
  @IsString()
  facultyName?: string;

  @IsString()
  @IsNotEmpty()
  campusName!: string;

  @IsString()
  @IsNotEmpty()
  modality!: string;

  @IsString()
  @IsNotEmpty()
  courseName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  initialCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxExtraCapacity?: number;
}
