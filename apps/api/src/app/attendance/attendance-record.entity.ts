import { AttendanceStatus } from '@uai/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceSessionEntity } from './attendance-session.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'attendance_records' })
@Unique(['attendanceSession', 'student'])
export class AttendanceRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AttendanceSessionEntity, (s) => s.records, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attendanceSessionId' })
  attendanceSession!: AttendanceSessionEntity;

  @ManyToOne(() => UserEntity, (u) => u.attendanceRecords, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'studentId' })
  student!: UserEntity;

  @Column({ type: 'enum', enum: AttendanceStatus })
  status!: AttendanceStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

