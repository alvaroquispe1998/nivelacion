import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { SectionsService } from '../sections/sections.service';
import { EnrollmentEntity } from './enrollment.entity';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentsRepo: Repository<EnrollmentEntity>,
    private readonly usersService: UsersService,
    private readonly sectionsService: SectionsService
  ) {}

  async bulkEnroll(sectionId: string, dnis: string[]) {
    const section = await this.sectionsService.getByIdOrThrow(sectionId);

    const normalized = Array.from(
      new Set(dnis.map((x) => x.trim()).filter(Boolean))
    );

    const result: {
      enrolled: string[];
      alreadyEnrolled: string[];
      notFound: string[];
      conflicts: Array<{ dni: string; reason: string }>;
    } = {
      enrolled: [],
      alreadyEnrolled: [],
      notFound: [],
      conflicts: [],
    };

    for (const dni of normalized) {
      const student = await this.usersService.findAlumnoByDni(dni);
      if (!student) {
        result.notFound.push(dni);
        continue;
      }

      const existing = await this.enrollmentsRepo.findOne({
        where: { student: { id: student.id } },
        relations: { section: true, student: true },
      });

      if (existing) {
        if (existing.section.id === section.id) {
          result.alreadyEnrolled.push(dni);
        } else {
          result.conflicts.push({
            dni,
            reason: `Already enrolled in section ${existing.section.name}`,
          });
        }
        continue;
      }

      await this.enrollmentsRepo.save(
        this.enrollmentsRepo.create({ section, student } as EnrollmentEntity)
      );
      result.enrolled.push(dni);
    }

    return result;
  }

  async assertStudentInSectionOrThrow(params: {
    studentId: string;
    sectionId: string;
  }) {
    const enr = await this.enrollmentsRepo.findOne({
      where: { section: { id: params.sectionId }, student: { id: params.studentId } },
      relations: { section: true, student: true },
    });
    if (!enr) {
      throw new NotFoundException('Student is not enrolled in this section');
    }
    return enr;
  }
}
