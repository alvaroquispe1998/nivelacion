import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SectionEntity } from '../sections/section.entity';
import { AttendanceSessionEntity } from '../attendance/attendance-session.entity';

@Entity({ name: 'schedule_blocks' })
export class ScheduleBlockEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SectionEntity, (s) => s.scheduleBlocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sectionId' })
  section!: SectionEntity;

  @Column({ type: 'char', length: 36, nullable: true })
  sectionCourseId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  courseName!: string;

  @Column({ type: 'tinyint' })
  dayOfWeek!: number; // 1=Lunes ... 7=Domingo

  @Column({ type: 'char', length: 5 })
  startTime!: string; // HH:mm

  @Column({ type: 'char', length: 5 })
  endTime!: string; // HH:mm

  @Column({ type: 'date', nullable: true })
  startDate!: string | null; // YYYY-MM-DD

  @Column({ type: 'date', nullable: true })
  endDate!: string | null; // YYYY-MM-DD

  @Column({ type: 'varchar', length: 500, nullable: true })
  zoomUrl!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => AttendanceSessionEntity, (s) => s.scheduleBlock)
  attendanceSessions!: AttendanceSessionEntity[];
}
