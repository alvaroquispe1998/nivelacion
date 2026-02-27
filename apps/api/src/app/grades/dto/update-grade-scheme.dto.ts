import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GradeSchemeComponentDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['DIAGNOSTICO', 'FK1', 'FK2', 'PARCIAL'])
  code!: 'DIAGNOSTICO' | 'FK1' | 'FK2' | 'PARCIAL';

  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderIndex!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  maxScore?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGradeSchemeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeSchemeComponentDto)
  components!: GradeSchemeComponentDto[];
}

