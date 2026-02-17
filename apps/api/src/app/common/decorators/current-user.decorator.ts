import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@uai/shared';

export interface JwtUser {
  sub: string;
  role: Role;
  fullName: string;
  dni: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtUser;
  }
);
