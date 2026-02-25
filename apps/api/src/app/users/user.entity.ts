import { Role } from '@uai/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceRecordEntity } from '../attendance/attendance-record.entity';
import { AttendanceSessionEntity } from '../attendance/attendance-session.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  codigoAlumno!: string | null;

  @Column({ type: 'varchar', length: 20, unique: true })
  dni!: string;

  @Column({ type: 'varchar', length: 200 })
  fullName!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  names!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paternalLastName!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  maternalLastName!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sex!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  careerName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  examDate!: string | null;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => AttendanceSessionEntity, (s) => s.createdBy)
  createdAttendanceSessions!: AttendanceSessionEntity[];

  @OneToMany(() => AttendanceRecordEntity, (r) => r.student)
  attendanceRecords!: AttendanceRecordEntity[];
}
