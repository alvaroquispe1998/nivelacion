import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isInternalUserRole, Role } from '@uai/shared';
import { hashInternalPassword, verifyStoredPassword } from '../users/passwords.util';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/user.entity';

const ADMIN_LOGIN = 'administrador';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@UAI19';
const LOGIN_TIMEOUT_MS = 3_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) { }

  async login(body: { usuario: string; password: string }) {
    const usuario = String(body.usuario ?? '').trim();
    const password = String(body.password ?? '');

    if (!usuario || !password) {
      throw new BadRequestException('usuario and password are required');
    }

    return this.withTimeout(
      () => this.performLogin(usuario, password),
      LOGIN_TIMEOUT_MS,
    );
  }

  private async performLogin(usuario: string, password: string) {
    const usuarioLower = usuario.toLowerCase();

    const user = await this.findUserForLogin(usuario);

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.validateLoginCredentials({
      user,
      password,
      usuarioLower,
    });
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  private findUserForLogin(usuario: string) {
    if (/^[a-zA-Z]\d{5,20}$/.test(usuario)) {
      return this.usersService.findAlumnoByCodigoAlumno(usuario.toUpperCase());
    }

    return this.usersService.findByDni(usuario);
  }

  async me(userId: string) {
    const user = await this.usersService.getByIdOrThrow(userId);
    return { user: this.toAuthUser(user) };
  }

  async changePassword(
    userId: string,
    body: { currentPassword: string; newPassword: string }
  ) {
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');

    if (!currentPassword || !newPassword) {
      throw new BadRequestException('currentPassword and newPassword are required');
    }

    const user = await this.usersService.getByIdOrThrow(userId);
    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    const isValidCurrentPassword = await this.validateLoginCredentials({
      user,
      password: currentPassword,
      usuarioLower: String(user.dni ?? '').trim().toLowerCase(),
    });

    if (!isValidCurrentPassword) {
      throw new UnauthorizedException('Current password is invalid');
    }

    user.passwordHash = await hashInternalPassword(newPassword);
    await this.usersService.save(user);
    return { ok: true };
  }

  private async validateLoginCredentials(params: {
    user: UserEntity;
    password: string;
    usuarioLower: string;
  }) {
    const { user, password, usuarioLower } = params;

    if (isInternalUserRole(user.role)) {
      const matchesStoredPassword = await verifyStoredPassword(user.passwordHash, password);
      const matchesLegacyAdminEnv =
        usuarioLower === ADMIN_LOGIN &&
        user.role === Role.ADMIN &&
        password === ADMIN_PASSWORD;

      return matchesStoredPassword || matchesLegacyAdminEnv;
    }

    if (user.role === Role.ALUMNO || user.role === Role.DOCENTE) {
      if (String(user.passwordHash ?? '').trim()) {
        return verifyStoredPassword(user.passwordHash, password);
      }
      return password === user.dni;
    }

    return false;
  }

  private async buildAuthResponse(user: UserEntity) {
    const payload = {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      dni: user.dni,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: UserEntity) {
    return {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      dni: user.dni,
      codigoAlumno: user.codigoAlumno ?? null,
      email: user.email ?? null,
      names: user.names ?? null,
      paternalLastName: user.paternalLastName ?? null,
      maternalLastName: user.maternalLastName ?? null,
    };
  }

  private async withTimeout<T>(
    fn: () => Promise<T>,
    ms: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.logger.warn(`Login timed out after ${ms}ms`);
        reject(
          new UnauthorizedException(
            'Login timed out, please try again',
          ),
        );
      }, ms);

      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }
}
