import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'periods' })
export class PeriodEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: 'NIVELACION' })
  kind!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  startsAt!: string | null;

  @Column({ type: 'date', nullable: true })
  endsAt!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

