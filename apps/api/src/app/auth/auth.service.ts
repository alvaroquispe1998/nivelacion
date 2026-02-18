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
    const isStaffLogin = Boolean(password);

    if (isStudentLogin === isStaffLogin) {
      throw new BadRequestException(
        'Provide either codigoAlumno (student) or password (staff)'
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

    const user = await this.usersService.findStaffByDni(dni);
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const ok = await this.verifyPassword(user.id, user.passwordHash, password!);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      dni: user.dni,
    };
    if (![Role.ADMIN, Role.DOCENTE].includes(user.role)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, fullName: user.fullName, role: user.role },
    };
  }

  private async verifyPassword(
    userId: string,
    passwordHash: string,
    plainPassword: string
  ) {
    if (passwordHash.startsWith('PLAIN:')) {
      const expected = passwordHash.slice('PLAIN:'.length);
      if (plainPassword !== expected) return false;
      const user = await this.usersService.getByIdOrThrow(userId);
      user.passwordHash = await bcrypt.hash(plainPassword, 10);
      await this.usersService.save(user);
      return true;
    }
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
