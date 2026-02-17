import type { AttendanceStatus, Role } from './enums';

export type Uuid = string;

export interface AuthLoginRequest {
  dni: string;
  codigoAlumno?: string;
  password?: string;
}

export interface AuthUser {
  id: Uuid;
  fullName: string;
  role: Role;
}

export interface AuthLoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface AuthMeResponse {
  user: AuthUser;
}

export interface StudentScheduleItem {
  dayOfWeek: number; // 1=Lunes ... 7=Domingo
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  courseName: string;
  sectionName: string;
  zoomUrl?: string | null;
  location?: string | null;
}

export interface StudentAttendanceItem {
  courseName: string;
  sessionDate: string; // YYYY-MM-DD
  status: AttendanceStatus;
}

export interface AdminSection {
  id: Uuid;
  name: string;
  code?: string | null;
  akademicSectionId?: string | null;
  facultyGroup?: string | null;
  facultyName?: string | null;
  campusName?: string | null;
  modality?: string | null;
  initialCapacity?: number;
  maxExtraCapacity?: number;
  isAutoLeveling?: boolean;
}

export interface AdminScheduleBlock {
  id: Uuid;
  sectionId: Uuid;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  zoomUrl?: string | null;
  location?: string | null;
}

export interface AdminAttendanceSession {
  id: Uuid;
  scheduleBlockId: Uuid;
  sessionDate: string; // YYYY-MM-DD
  courseName: string;
}

export interface AdminAttendanceRecord {
  studentId: Uuid;
  fullName: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export interface LevelingConfig {
  initialCapacity: number;
  maxExtraCapacity: number;
}

export interface LevelingSectionPreview {
  code: string;
  name: string;
  facultyGroup: string;
  facultyName: string;
  campusName: string;
  modality: string;
  initialCapacity: number;
  maxExtraCapacity: number;
  studentCount: number;
  courses: string[];
}

export interface LevelingPlanResponse {
  configUsed: LevelingConfig;
  inputSummary: {
    rowsRead: number;
    eligibleStudents: number;
    unknownCareers: string[];
  };
  needsByCourse: Record<string, number>;
  summary: {
    hoursPerGroup: number;
    pricePerHour: number;
    totalPay4Weeks: number;
    byFaculty: Array<{
      facultyGroup: string;
      rows: Array<{
        label: string;
        campusName: string;
        modality: string;
        courseGroups: Record<string, number>;
        totalGroups: number;
      }>;
      totalGroups: number;
      totalHours: number;
      totalPay4Weeks: number;
    }>;
  };
  sections: LevelingSectionPreview[];
  applied: null | {
    sectionsCreated: number;
    sectionsUpdated: number;
    studentsCreated: number;
    studentsUpdated: number;
    enrollmentsCreated: number;
  };
}
