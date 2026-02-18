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
import { SectionEntity } from './section.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'section_course_teachers' })
@Unique(['sectionCourseId'])
export class SectionCourseTeacherEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectionId' })
  section!: SectionEntity;

  @Column({ type: 'char', length: 36, nullable: true })
  sectionCourseId!: string | null;

  // FK to courses(id), kept as scalar because we do not have a CourseEntity.
  @Column({ type: 'char', length: 36 })
  courseId!: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'teacherId' })
  teacher!: UserEntity | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
