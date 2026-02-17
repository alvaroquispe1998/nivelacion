import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@uai/shared';
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

  async findAdminByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { dni, role: Role.ADMIN } });
  }

  async findAlumnoByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { dni, role: Role.ALUMNO } });
  }
}

