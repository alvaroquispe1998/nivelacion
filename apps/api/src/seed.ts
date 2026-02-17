import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AttendanceStatus, Role } from '@uai/shared';
import { createDataSourceOptionsFromEnv } from './app/database/typeorm.options';
import { AttendanceRecordEntity } from './app/attendance/attendance-record.entity';
import { AttendanceSessionEntity } from './app/attendance/attendance-session.entity';
import { EnrollmentEntity } from './app/enrollments/enrollment.entity';
import { ScheduleBlockEntity } from './app/schedule-blocks/schedule-block.entity';
import { SectionEntity } from './app/sections/section.entity';
import { UserEntity } from './app/users/user.entity';
import * as bcrypt from 'bcrypt';

async function main() {
  const dataSource = new DataSource(createDataSourceOptionsFromEnv());
  await dataSource.initialize();
  await dataSource.runMigrations();

  const usersRepo = dataSource.getRepository(UserEntity);
  const sectionsRepo = dataSource.getRepository(SectionEntity);
  const enrollmentsRepo = dataSource.getRepository(EnrollmentEntity);
  const blocksRepo = dataSource.getRepository(ScheduleBlockEntity);
  const sessionsRepo = dataSource.getRepository(AttendanceSessionEntity);
  const recordsRepo = dataSource.getRepository(AttendanceRecordEntity);

  const adminDni = process.env.SEED_ADMIN_DNI ?? '00000000';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const adminFullName = process.env.SEED_ADMIN_FULLNAME ?? 'Administrador UAI';

  let admin = await usersRepo.findOne({ where: { dni: adminDni } });
  if (!admin) {
    admin = usersRepo.create({
      dni: adminDni,
      fullName: adminFullName,
      role: Role.ADMIN,
      codigoAlumno: null,
      passwordHash: await bcrypt.hash(adminPassword, 10),
    });
    await usersRepo.save(admin);
  }

  const demoStudents: Array<{ dni: string; codigo: string; fullName: string }> =
    Array.from({ length: 10 }).map((_, i) => {
      const n = i + 1;
      return {
        dni: `1000000${n}`,
        codigo: `A${String(n).padStart(3, '0')}`,
        fullName: `Alumno Demo ${n}`,
      };
    });

  const students: UserEntity[] = [];
  for (const s of demoStudents) {
    let student = await usersRepo.findOne({ where: { dni: s.dni } });
    if (!student) {
      student = usersRepo.create({
        dni: s.dni,
        codigoAlumno: s.codigo,
        fullName: s.fullName,
        role: Role.ALUMNO,
        passwordHash: null,
      });
      await usersRepo.save(student);
    }
    students.push(student);
  }

  const sectionNames = ['SECCION DEMO 1', 'SECCION DEMO 2'];
  const sections: SectionEntity[] = [];
  for (const name of sectionNames) {
    let section = await sectionsRepo.findOne({ where: { name } });
    if (!section) {
      section = sectionsRepo.create({ name, akademicSectionId: null });
      await sectionsRepo.save(section);
    }
    sections.push(section);
  }

  // Enroll first 5 students in section 1, rest in section 2
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const section = i < 5 ? sections[0] : sections[1];
    const exists = await enrollmentsRepo.findOne({
      where: { section: { id: section.id }, student: { id: student.id } },
      relations: { section: true, student: true },
    });
    if (!exists) {
      await enrollmentsRepo.save(
        enrollmentsRepo.create({ section, student } as EnrollmentEntity)
      );
    }
  }

  // Create 2 demo schedule blocks (non-overlapping)
  const demoBlocks: Array<{
    section: SectionEntity;
    courseName: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }> = [
    {
      section: sections[0],
      courseName: 'Matematica',
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '10:00',
    },
    {
      section: sections[1],
      courseName: 'Comunicacion',
      dayOfWeek: 2,
      startTime: '09:00',
      endTime: '11:00',
    },
  ];

  const blocks: ScheduleBlockEntity[] = [];
  for (const b of demoBlocks) {
    let block = await blocksRepo.findOne({
      where: {
        section: { id: b.section.id },
        courseName: b.courseName,
        dayOfWeek: b.dayOfWeek,
        startTime: b.startTime,
        endTime: b.endTime,
      },
      relations: { section: true },
    });
    if (!block) {
      block = blocksRepo.create({
        section: b.section,
        courseName: b.courseName,
        dayOfWeek: b.dayOfWeek,
        startTime: b.startTime,
        endTime: b.endTime,
        zoomUrl: null,
        location: 'Aula Demo',
      });
      await blocksRepo.save(block);
    }
    blocks.push(block);
  }

  // Create 3 demo attendance sessions for the first block
  const demoDates = ['2026-02-10', '2026-02-12', '2026-02-13'];
  const block1 = blocks[0];

  for (const date of demoDates) {
    let session = await sessionsRepo.findOne({
      where: {
        scheduleBlock: { id: block1.id },
        sessionDate: date,
      },
      relations: { scheduleBlock: true },
    });
    if (!session) {
      session = sessionsRepo.create({
        scheduleBlock: block1,
        sessionDate: date,
        createdBy: admin,
      });
      await sessionsRepo.save(session);
    }

    // Ensure records exist for students enrolled in the section
    const enrolled = await enrollmentsRepo.find({
      where: { section: { id: block1.section.id } },
      relations: { student: true, section: true },
    });

    for (const enr of enrolled) {
      const existing = await recordsRepo.findOne({
        where: {
          attendanceSession: { id: session.id },
          student: { id: enr.student.id },
        },
        relations: { attendanceSession: true, student: true },
      });
      if (!existing) {
        await recordsRepo.save(
          recordsRepo.create({
            id: randomUUID(),
            attendanceSession: session,
            student: enr.student,
            status: AttendanceStatus.FALTO,
            notes: null,
          })
        );
      }
    }

    // Mark first student present in each session (demo)
    if (enrolled[0]) {
      const rec = await recordsRepo.findOne({
        where: {
          attendanceSession: { id: session.id },
          student: { id: enrolled[0].student.id },
        },
        relations: { attendanceSession: true, student: true },
      });
      if (rec) {
        rec.status = AttendanceStatus.ASISTIO;
        await recordsRepo.save(rec);
      }
    }
  }

  await dataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

