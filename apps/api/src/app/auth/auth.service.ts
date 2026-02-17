import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@uai/shared';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async login(body: {
    dni: string;
    codigoAlumno?: string;
    password?: string;
  }) {
    const { dni, codigoAlumno, password } = body;

    const isStudentLogin = Boolean(codigoAlumno);
    const isAdminLogin = Boolean(password);

    if (isStudentLogin === isAdminLogin) {
      throw new BadRequestException(
        'Provide either codigoAlumno (student) or password (admin)'
      );
    }

    if (isStudentLogin) {
      const user = await this.usersService.findAlumnoByDniCodigo(
        dni,
        codigoAlumno!
      );
      if (!user) throw new UnauthorizedException('Invalid credentials');

      const payload = {
        sub: user.id,
        role: user.role,
        fullName: user.fullName,
        dni: user.dni,
      };
      return {
        accessToken: await this.jwtService.signAsync(payload),
        user: { id: user.id, fullName: user.fullName, role: user.role },
      };
    }

    const user = await this.usersService.findAdminByDni(dni);
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password!, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      dni: user.dni,
    };
    if (user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, fullName: user.fullName, role: user.role },
    };
  }
}

