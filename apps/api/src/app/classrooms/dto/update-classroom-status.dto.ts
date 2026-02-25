import { IsIn, IsString } from 'class-validator';

export class UpdateClassroomStatusDto {
  @IsString()
  @IsIn(['ACTIVA', 'INACTIVA'])
  status!: 'ACTIVA' | 'INACTIVA';
}
