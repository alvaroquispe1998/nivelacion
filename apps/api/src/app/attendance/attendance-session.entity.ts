import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { UserEntity } from '../users/user.entity';
import { AttendanceRecordEntity } from './attendance-record.entity';

@Entity({ name: 'attendance_sessions' })
@Unique(['scheduleBlock', 'sessionDate'])
export class AttendanceSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ScheduleBlockEntity, (b) => b.attendanceSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scheduleBlockId' })
  scheduleBlock!: ScheduleBlockEntity;

  @Column({ type: 'date' })
  sessionDate!: string; // YYYY-MM-DD

  @ManyToOne(() => UserEntity, (u) => u.createdAttendanceSessions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'createdById' })
  createdBy!: UserEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => AttendanceRecordEntity, (r) => r.attendanceSession)
  records!: AttendanceRecordEntity[];
}

