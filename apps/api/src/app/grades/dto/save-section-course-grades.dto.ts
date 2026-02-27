import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SectionCourseGradeInputDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  componentId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  score!: number;
}

export class SaveSectionCourseGradesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionCourseGradeInputDto)
  grades!: SectionCourseGradeInputDto[];
}

export class GradesReportFilterDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  facultyGroup?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  campusName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  careerName?: string;
}

