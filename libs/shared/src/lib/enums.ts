export enum Role {
  ALUMNO = 'ALUMNO',
  ADMIN = 'ADMIN',
  DOCENTE = 'DOCENTE',
  ADMINISTRATIVO = 'ADMINISTRATIVO',
  SOPORTE_TECNICO = 'SOPORTE_TECNICO',
}

export const ADMIN_BACKOFFICE_ROLES: Role[] = [Role.ADMIN, Role.ADMINISTRATIVO];

export type InternalUserRole =
  | Role.ADMIN
  | Role.ADMINISTRATIVO
  | Role.SOPORTE_TECNICO;

export const INTERNAL_USER_ROLES: InternalUserRole[] = [
  Role.ADMIN,
  Role.ADMINISTRATIVO,
  Role.SOPORTE_TECNICO,
];

export function isAdminBackofficeRole(
  role: Role | null | undefined
): role is Role.ADMIN | Role.ADMINISTRATIVO {
  return role === Role.ADMIN || role === Role.ADMINISTRATIVO;
}

export function isInternalUserRole(
  role: Role | null | undefined
): role is InternalUserRole {
  return (
    role === Role.ADMIN ||
    role === Role.ADMINISTRATIVO ||
    role === Role.SOPORTE_TECNICO
  );
}

export enum AttendanceStatus {
  ASISTIO = 'ASISTIO',
  FALTO = 'FALTO',
}
