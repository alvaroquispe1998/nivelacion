import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdatePavilionDto {
  @IsOptional()
  @IsUUID()
  campusId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVO', 'INACTIVO'])
  status?: 'ACTIVO' | 'INACTIVO';
}
