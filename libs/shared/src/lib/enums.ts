export enum Role {
  ALUMNO = 'ALUMNO',
  ADMIN = 'ADMIN',
  DOCENTE = 'DOCENTE',
  ADMINISTRATIVO = 'ADMINISTRATIVO',
}

export const ADMIN_BACKOFFICE_ROLES: Role[] = [Role.ADMIN, Role.ADMINISTRATIVO];

export function isAdminBackofficeRole(
  role: Role | null | undefined
): role is Role.ADMIN | Role.ADMINISTRATIVO {
  return role === Role.ADMIN || role === Role.ADMINISTRATIVO;
}

export enum AttendanceStatus {
  ASISTIO = 'ASISTIO',
  FALTO = 'FALTO',
}
