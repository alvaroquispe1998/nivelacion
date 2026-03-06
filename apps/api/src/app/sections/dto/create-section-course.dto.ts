import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSectionCourseDto {
  @IsString()
  @IsNotEmpty()
  facultyGroup!: string;

  @IsString()
  @IsNotEmpty()
  campusName!: string;

  @IsString()
  @IsNotEmpty()
  courseName!: string;

  @IsString()
  @IsNotEmpty()
  modality!: string;

  @IsOptional()
  @IsString()
  sectionId?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  createNewSection?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  initialCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxExtraCapacity?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enforceVirtualCapacity?: boolean;
}
