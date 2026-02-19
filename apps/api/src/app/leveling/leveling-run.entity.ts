import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'leveling_runs' })
export class LevelingRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'char', length: 36 })
  periodId!: string;

  @Column({ type: 'varchar', length: 20, default: 'STRUCTURED' })
  status!: string;

  @Column({ type: 'json', nullable: true })
  configJson!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sourceFileHash!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  createdBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
