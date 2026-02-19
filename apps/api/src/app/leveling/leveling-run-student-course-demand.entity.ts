import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'leveling_run_student_course_demands' })
export class LevelingRunStudentCourseDemandEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'char', length: 36 })
  runId!: string;

  @Column({ type: 'char', length: 36 })
  studentId!: string;

  @Column({ type: 'char', length: 36 })
  courseId!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  facultyGroup!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  campusName!: string | null;

  @Column({ type: 'boolean', default: true })
  required!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
