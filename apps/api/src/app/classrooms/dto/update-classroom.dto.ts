import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateClassroomDto {
  @IsOptional()
  @IsUUID()
  campusId?: string;

  @IsOptional()
  @IsUUID()
  pavilionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  levelName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['AULA', 'LABORATORIO', 'AUDITORIO'])
  type?: 'AULA' | 'LABORATORIO' | 'AUDITORIO';

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVA', 'INACTIVA'])
  status?: 'ACTIVA' | 'INACTIVA';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string | null;
}
