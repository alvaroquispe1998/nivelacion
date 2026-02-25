import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClassroomDto {
  @IsUUID()
  @IsNotEmpty()
  campusId!: string;

  @IsUUID()
  @IsNotEmpty()
  pavilionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  levelName!: string;

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
