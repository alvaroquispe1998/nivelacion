import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ClassroomType = 'AULA' | 'LABORATORIO' | 'AUDITORIO';
export type ClassroomStatus = 'ACTIVA' | 'INACTIVA';

@Entity({ name: 'classrooms' })
export class ClassroomEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'char', length: 36, nullable: true })
  campusId!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  pavilionId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  campusName!: string;

  @Column({ type: 'varchar', length: 60 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'int', unsigned: true })
  capacity!: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  levelName!: string | null;

  @Column({ type: 'enum', enum: ['AULA', 'LABORATORIO', 'AUDITORIO'], default: 'AULA' })
  type!: ClassroomType;

  @Column({ type: 'enum', enum: ['ACTIVA', 'INACTIVA'], default: 'ACTIVA' })
  status!: ClassroomStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
