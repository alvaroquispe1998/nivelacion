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
  dni?: string | null;
  codigoAlumno?: string | null;
  email?: string | null;
  names?: string | null;
  paternalLastName?: string | null;
  maternalLastName?: string | null;
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
  modality?: string | null;
  classroomCode?: string | null;
  classroomName?: string | null;
  zoomUrl?: string | null;
  location?: string | null;
  referenceModality?: string | null;
  referenceClassroom?: string | null;
}

export interface StudentAttendanceItem {
  courseName: string;
  sessionDate: string; // YYYY-MM-DD
  status: AttendanceStatus;
}

export interface StudentGradesReportComponentScore {
  componentId: Uuid;
  code: string;
  name: string;
  weight: number;
  score: number | null;
}

export interface StudentGradesReportRow {
  sectionCourseId: Uuid;
  courseName: string;
  sectionCode?: string | null;
  sectionName: string;
  facultyGroup?: string | null;
  facultyName?: string | null;
  campusName?: string | null;
  modality?: string | null;
  components: StudentGradesReportComponentScore[];
  isComplete: boolean;
  finalAverage: number;
  approved: boolean;
}

export interface StudentGradesReportResponse {
  periodId: Uuid;
  components: Array<{
    id: Uuid;
    code: string;
    name: string;
    weight: number;
  }>;
  rows: StudentGradesReportRow[];
}

export interface AdminStudentReportSearchItem {
  studentId: Uuid;
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  careerName: string | null;
}

export interface AdminStudentReportStudentProfile {
  studentId: Uuid;
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  names: string | null;
  paternalLastName: string | null;
  maternalLastName: string | null;
  careerName: string | null;
  sex: string | null;
  email: string | null;
  examDate: string | null;
}

export interface AdminStudentEnrollmentItem {
  sectionCourseId: Uuid;
  courseName: string;
  sectionCode: string | null;
  sectionName: string;
  facultyGroup: string | null;
  facultyName: string | null;
  campusName: string | null;
  modality: string | null;
  teacherName: string | null;
  classroomCode: string | null;
  classroomName: string | null;
  classroomLabel: string | null;
}

export interface AdminStudentAttendanceSummaryItem {
  courseName: string;
  totalSessions: number;
  attendedCount: number;
  absentCount: number;
  attendanceRate: number;
}

export interface AdminStudentReportResponse {
  periodId: Uuid;
  student: AdminStudentReportStudentProfile;
  schedule: StudentScheduleItem[];
  enrollment: AdminStudentEnrollmentItem[];
  grades: StudentGradesReportResponse;
  attendance: {
    summaryByCourse: AdminStudentAttendanceSummaryItem[];
    sessions: StudentAttendanceItem[];
  };
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
  scheduleSummary?: string | null;
  hasSchedule?: boolean;
  classroomId?: Uuid | null;
  classroomCode?: string | null;
  classroomName?: string | null;
  classroomCapacity?: number | null;
  classroomPavilionCode?: string | null;
  classroomPavilionName?: string | null;
  classroomLevelName?: string | null;
  capacitySource?: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA' | null;
  planningStatus?: 'OK' | 'FALTA_AULA' | 'CRUCE_AULA' | 'CRUCE_DOCENTE' | null;
  planningStatusLabel?: string | null;
  hasClassroomConflict?: boolean;
  hasTeacherConflict?: boolean;
  availableSeats?: number | null;
  isMotherSection?: boolean;
}

export interface AdminCourseScopeProgress {
  facultyGroup: string;
  campusName: string;
  courseName: string;
  demandaTotal: number;
  matriculados: number;
  porMatricular: number;
  capacidadPlanificada: number;
  brecha: number;
  exceso: number;
  capacidadSuficiente: boolean;
}

export interface AdminFacultyFilterOption {
  facultyGroup: string;
  facultyName: string;
}

export interface AdminClassroom {
  id: Uuid;
  campusId?: Uuid | null;
  campusName: string;
  pavilionId?: Uuid | null;
  pavilionCode?: string | null;
  pavilionName?: string | null;
  code: string;
  name: string;
  capacity: number;
  levelName?: string | null;
  type: 'AULA' | 'LABORATORIO' | 'AUDITORIO';
  status: 'ACTIVA' | 'INACTIVA';
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminPavilion {
  id: Uuid;
  campusId: Uuid;
  campusName?: string | null;
  code: string;
  name: string;
  status: 'ACTIVO' | 'INACTIVO';
  createdAt?: string;
  updatedAt?: string;
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
  classroomId?: Uuid | null;
  classroomCode?: string | null;
  classroomName?: string | null;
  classroomCapacity?: number | null;
  classroomPavilionCode?: string | null;
  classroomPavilionName?: string | null;
  classroomLevelName?: string | null;
  capacitySource?: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA' | null;
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
  referenceModality?: string | null;
  referenceClassroom?: string | null;
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

export type GradeComponentCode = 'DIAGNOSTICO' | 'FK1' | 'FK2' | 'PARCIAL';

export interface GradeSchemeComponent {
  id: Uuid;
  schemeId: Uuid;
  code: GradeComponentCode;
  name: string;
  weight: number;
  orderIndex: number;
  minScore: number;
  maxScore: number;
  isActive: boolean;
}

export interface GradeSchemeResponse {
  id: Uuid;
  periodId: Uuid;
  status: 'DRAFT' | 'LOCKED';
  components: GradeSchemeComponent[];
}

export interface GradesSectionCourseOption {
  sectionCourseId: Uuid;
  sectionId: Uuid;
  sectionCode?: string | null;
  sectionName: string;
  courseName: string;
  facultyGroup?: string | null;
  facultyName?: string | null;
  campusName?: string | null;
  modality?: string | null;
  studentCount: number;
}

export interface SectionCourseGradesPublication {
  isPublished: boolean;
  publishedAt?: string | null;
  publishedBy?: string | null;
}

export interface SectionCourseGradesStudentRow {
  studentId: Uuid;
  dni: string;
  codigoAlumno?: string | null;
  fullName: string;
  careerName?: string | null;
  scores: Record<string, number | null>;
  isComplete: boolean;
  finalAverage: number;
  approved: boolean;
}

export interface SectionCourseGradesResponse {
  periodId: Uuid;
  sectionCourse: {
    sectionCourseId: Uuid;
    sectionId: Uuid;
    periodId: Uuid;
    courseId: Uuid;
    courseName: string;
    sectionCode?: string | null;
    sectionName: string;
    facultyGroup?: string | null;
    facultyName?: string | null;
    campusName?: string | null;
    modality?: string | null;
  };
  scheme: {
    id: Uuid;
    status: 'DRAFT' | 'LOCKED';
    components: GradeSchemeComponent[];
  };
  publication: SectionCourseGradesPublication;
  stats: {
    students: number;
    requiredCells: number;
    gradedCells: number;
    missingCells: number;
  };
  students: SectionCourseGradesStudentRow[];
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
  sectionsCreatedByExpansion: number;
  sectionCoursesCreatedByExpansion: number;
  offersReused: number;
  pendingDemandsEvaluated: number;
}

export interface LevelingAppendPreview {
  runId?: Uuid | null;
  runStatus?: LevelingRunStatus | null;
  demandsCreated: number;
  demandsOmitted: number;
  sectionsCreatedByExpansion: number;
  sectionCoursesCreatedByExpansion: number;
  offersReused: number;
  pendingDemandsEvaluated: number;
  existingFreeSeatsDetected?: number;
  newRequiredSeats?: number;
  groupsConvertedToVirtual?: number;
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
      facultyGroup: string;
      campusName: string;
      sourceModality: 'PRESENCIAL' | 'VIRTUAL' | 'SIN DATO';
      needsByCourse: Record<string, number>;
      totalNeeds: number;
    }>;
  };
  totalRowsProcessed?: number;
  levelingEligibleCount?: number;
  levelingDemandCount?: number;
  welcomeDemandCount?: number;
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
            origin?: 'EXISTING_FREE' | 'NEW_REQUIRED';
            sectionCourseId?: string;
            availableSeats?: number;
            hasExistingVirtual?: boolean;
            sectionCode?: string;
            sectionCampusName?: string;
          }>
        >;
      }>;
    }>;
  };
  sections: LevelingSectionPreview[];
  runId?: Uuid | null;
  runStatus?: LevelingRunStatus | null;
  applied: null | LevelingAppliedStructure;
  appendPreview?: LevelingAppendPreview | null;
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
  hasTeacher?: boolean;
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
  classroomId?: Uuid | null;
  classroomCode?: string | null;
  classroomName?: string | null;
  classroomCapacity?: number | null;
  classroomPavilionCode?: string | null;
  classroomPavilionName?: string | null;
  classroomLevelName?: string | null;
  capacitySource?: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA' | null;
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

export interface LevelingMatriculationFacultyStatus {
  facultyGroup: string;
  totalSectionCourses: number;
  withSchedule: number;
  withTeacher: number;
  pendingDemands: number;
  ready: boolean;
}

export interface LevelingMatriculationPreviewStudent {
  studentId: Uuid;
  studentCode?: string | null;
  studentName: string;
}

export interface LevelingMatriculationPreviewSectionCourse {
  sectionCourseId: Uuid;
  sectionId: Uuid;
  sectionCode?: string | null;
  sectionName: string;
  courseId: Uuid;
  courseName: string;
  teacherId?: Uuid | null;
  teacherName?: string | null;
  initialCapacity: number;
  maxExtraCapacity: number;
  classroomId?: Uuid | null;
  classroomCode?: string | null;
  classroomName?: string | null;
  classroomCapacity?: number | null;
  classroomPavilionCode?: string | null;
  classroomPavilionName?: string | null;
  classroomLevelName?: string | null;
  capacitySource?: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA' | null;
  hasSchedule: boolean;
  hasTeacher: boolean;
  assignedCount: number;
  students: LevelingMatriculationPreviewStudent[];
}

export interface LevelingMatriculationPreviewSection {
  sectionId: Uuid;
  sectionCode?: string | null;
  sectionName: string;
  facultyGroup?: string | null;
  facultyName?: string | null;
  campusName?: string | null;
  modality?: string | null;
  initialCapacity: number;
  maxExtraCapacity: number;
  teacherId?: Uuid | null;
  teacherName?: string | null;
  sectionCourses: LevelingMatriculationPreviewSectionCourse[];
}

export interface LevelingMatriculationPreviewResponse {
  runId: Uuid;
  status: LevelingRunStatus;
  selectedFacultyGroup?: string | null;
  faculties: LevelingMatriculationFacultyStatus[];
  readyFacultyGroups: string[];
  canMatriculateSelectedFaculty: boolean;
  assignedCount: number;
  sections: LevelingMatriculationPreviewSection[];
  summaryBySectionCourse: LevelingMatriculationSectionSummaryItem[];
  unassigned: LevelingMatriculationUnassignedItem[];
  conflicts: LevelingRunConflictItem[];
}
