import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@uai/shared';
import { In } from 'typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>
  ) {}

  async getByIdOrThrow(id: string): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAlumnoByDniCodigo(
    dni: string,
    codigoAlumno: string
  ): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { dni, codigoAlumno, role: Role.ALUMNO },
    });
  }

  async findAlumnoByCodigoAlumno(codigoAlumno: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { codigoAlumno, role: Role.ALUMNO },
    });
  }

  async findAdminByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { dni, role: Role.ADMIN } });
  }

  async findStaffByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { dni, role: In([Role.ADMIN, Role.DOCENTE]) },
    });
  }

  async findAlumnoByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { dni, role: Role.ALUMNO } });
  }

  async save(user: UserEntity) {
    return this.usersRepo.save(user);
  }
}
