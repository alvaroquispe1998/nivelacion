import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdatePavilionStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['ACTIVO', 'INACTIVO'])
  status!: 'ACTIVO' | 'INACTIVO';
}
