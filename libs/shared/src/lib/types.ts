import type { AttendanceStatus, Role } from './enums';

export type Uuid = string;

export interface AuthLoginRequest {
  usuario: string;
  password: string;
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
  teacherName?: string | null;
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
  studentCount?: number;
  teacherId?: Uuid | null;
  teacherDni?: string | null;
  teacherName?: string | null;
}

export interface AdminTeacher {
  id: Uuid;
  dni: string;
  fullName: string;
}

export interface AdminScheduleConflictBlock {
  blockId: Uuid;
  sectionCourseId: Uuid;
  sectionId: Uuid;
  sectionCode?: string | null;
  sectionName: string;
  courseId: Uuid;
  courseName: string;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface AdminScheduleConflictItem {
  studentId: Uuid;
  studentCode?: string | null;
  studentName: string;
  dayOfWeek: number;
  blockA: AdminScheduleConflictBlock;
  blockB: AdminScheduleConflictBlock;
}

export interface AdminReassignmentOption {
  sectionCourseId: Uuid;
  sectionId: Uuid;
  sectionCode?: string | null;
  sectionName: string;
  courseId: Uuid;
  courseName: string;
  facultyGroup?: string | null;
  campusName?: string | null;
  modality?: string | null;
  currentStudents: number;
  projectedStudents: number;
  initialCapacity: number;
  maxExtraCapacity: number;
  createsConflict: boolean;
  overCapacity: boolean;
}

export interface AdminReassignmentResult {
  ok: boolean;
  studentId: Uuid;
  fromSectionCourseId: Uuid;
  toSectionCourseId: Uuid;
  overCapacity: boolean;
  projectedStudents: number;
}

export interface AdminScheduleBlock {
  id: Uuid;
  sectionId: Uuid;
  sectionCourseId?: Uuid | null;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
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

export type LevelingRunStatus =
  | 'STRUCTURED'
  | 'READY'
  | 'MATRICULATED'
  | 'ARCHIVED';

export interface LevelingAppliedStructure {
  runId: Uuid;
  runStatus: LevelingRunStatus;
  sectionsCreated: number;
  sectionsUpdated: number;
  studentsCreated: number;
  studentsUpdated: number;
  sectionCoursesCreated: number;
  sectionCoursesOmitted: number;
  demandsCreated: number;
  demandsOmitted: number;
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
  students: Array<{
    dni: string;
    codigoAlumno: string | null;
    fullName: string;
    careerName: string;
    sectionCourses: string[];
  }>;
}

export interface LevelingPlanResponse {
  configUsed: LevelingConfig;
  inputSummary: {
    rowsRead: number;
    eligibleStudents: number;
    unknownCareers: string[];
  };
  needsByCourse: Record<string, number>;
  programNeeds: {
    campuses: string[];
    modalities: string[];
    rows: Array<{
      careerName: string;
      facultyGroup: 'FICA' | 'SALUD';
      campusName: string;
      sourceModality: 'PRESENCIAL' | 'VIRTUAL' | 'SIN DATO';
      needsByCourse: Record<string, number>;
      totalNeeds: number;
    }>;
  };
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
        courseGroupSizes: Record<string, number[]>;
        totalGroups: number;
      }>;
      totalGroups: number;
      totalHours: number;
      totalPay4Weeks: number;
    }>;
  };
  groupPlan: {
    byFaculty: Array<{
      facultyGroup: string;
      rows: Array<{
        campusName: string;
        courses: Record<
          string,
          Array<{
            id: string;
            size: number;
            modality: 'PRESENCIAL' | 'VIRTUAL';
          }>
        >;
      }>;
    }>;
  };
  sections: LevelingSectionPreview[];
  runId?: Uuid | null;
  runStatus?: LevelingRunStatus | null;
  applied: null | LevelingAppliedStructure;
}

export interface LevelingRunDetailsResponse {
  runId: Uuid;
  periodId: Uuid;
  status: LevelingRunStatus;
  configUsed: LevelingConfig;
  sourceFileHash?: string | null;
  createdBy?: Uuid | null;
  createdAt: string;
  updatedAt: string;
  metrics: {
    sections: number;
    sectionCourses: number;
    manualSections: number;
    demands: number;
    assigned: number;
    studentsWithDemand: number;
    sectionCoursesWithSchedule: number;
    sectionCoursesWithoutSchedule: number;
  };
}

export interface LevelingRunSectionCourseView {
  sectionCourseId: Uuid;
  courseId: Uuid;
  courseName: string;
  hasSchedule: boolean;
  scheduleBlocksCount: number;
  assignedStudents: number;
}

export interface LevelingRunSectionView {
  sectionId: Uuid;
  name: string;
  code?: string | null;
  facultyGroup?: string | null;
  facultyName?: string | null;
  campusName?: string | null;
  modality?: string | null;
  initialCapacity: number;
  maxExtraCapacity: number;
  isAutoLeveling: boolean;
  levelingRunId?: Uuid | null;
  sectionCourses: LevelingRunSectionCourseView[];
}

export interface LevelingManualSectionCourseResult {
  runId: Uuid;
  sectionId: Uuid;
  sectionCourseId: Uuid;
  sectionCode?: string | null;
  sectionName: string;
  courseId: Uuid;
  courseName: string;
  isAutoLeveling: boolean;
}

export interface LevelingMatriculationUnassignedItem {
  studentId: Uuid;
  studentCode?: string | null;
  studentName: string;
  courseId: Uuid;
  courseName: string;
  facultyGroup?: string | null;
  campusName?: string | null;
  reason: string;
}

export interface LevelingMatriculationSectionSummaryItem {
  sectionCourseId: Uuid;
  sectionId: Uuid;
  sectionCode?: string | null;
  sectionName: string;
  courseId: Uuid;
  courseName: string;
  assignedCount: number;
  initialCapacity: number;
  maxExtraCapacity: number;
}

export interface LevelingMatriculationResult {
  runId: Uuid;
  status: LevelingRunStatus;
  assignedCount: number;
  unassigned: LevelingMatriculationUnassignedItem[];
  summaryBySectionCourse: LevelingMatriculationSectionSummaryItem[];
  conflictsFoundAfterAssign: number;
}

export interface LevelingRunConflictItem {
  studentId: Uuid;
  studentCode?: string | null;
  studentName: string;
  dayOfWeek: number;
  blockA: AdminScheduleConflictBlock;
  blockB: AdminScheduleConflictBlock;
}
