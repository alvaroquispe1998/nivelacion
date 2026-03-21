import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { AdminTeacher } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

export type WorkshopMode = 'BY_SIZE' | 'SINGLE';
export type SelectionMode = 'MANUAL';
export type FilterLevel = 'faculty' | 'campus' | 'career';

export interface WorkshopStudentRow {
  studentId: string;
  dni: string | null;
  fullName: string;
  codigoAlumno: string | null;
  careerName: string | null;
  campusName: string | null;
}

export interface FilterSnapshot {
  facultyGroups: string[];
  campusNames: string[];
  careerNames: string[];
}

export interface WorkshopRow {
  id: string;
  name: string;
  mode: WorkshopMode;
  groupSize: number | null;
  selectionMode: SelectionMode;
  facultyGroup: string | null;
  campusName: string | null;
  careerName: string | null;
  facultyGroups?: string[] | null;
  campusNames?: string[] | null;
  careerNames?: string[] | null;
  deliveryMode: 'VIRTUAL' | 'PRESENCIAL';
  venueCampusName: string | null;
  responsibleTeacherId?: string | null;
  responsibleTeacherDni?: string | null;
  responsibleTeacherName?: string | null;
  isActive: boolean;
  studentIds?: string[];
  selectedStudents?: WorkshopStudentRow[];
  selectedStudentsCount?: number;
  groupsCount?: number;
  scheduledGroupsCount?: number;
  lastApplicationId?: string | null;
  lastApplicationAt?: string | null;
}

export interface WorkshopGroupRow {
  id: string;
  workshopId: string;
  code: string;
  displayName: string;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  scheduleBlocks: GroupScheduleBlockRow[];
}

export interface GroupScheduleBlockRow {
  id?: string;
  groupId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
  zoomMeetingRecordId?: string | null;
  joinUrl?: string | null;
  startUrl?: string | null;
}

export interface WorkshopGroupScheduleSaveResponse {
  blocks: GroupScheduleBlockRow[];
  warnings?: {
    code: string;
    message: string;
    workshopName?: string | null;
    summary?: { affectedStudents: number; totalConflicts: number };
  } | null;
}

export interface WorkshopAssignmentPreview {
  workshop: WorkshopRow;
  groupsConfigured: number;
  groupsEligible: number;
  totalCandidates: number;
  assignedCount: number;
  pendingCount: number;
  pendingSummary: {
    SCHEDULE_CONFLICT: number;
    NO_CAPACITY: number;
    NO_ELIGIBLE_GROUP: number;
  };
  groups: Array<{
    sourceGroupId: string;
    code: string;
    displayName: string;
    capacity: number | null;
    assignedCount: number;
    sortOrder?: number;
    scheduleBlocks?: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate?: string | null;
      endDate?: string | null;
    }>;
    students: Array<{
      studentId: string;
      dni: string | null;
      fullName: string;
      codigoAlumno: string | null;
      careerName?: string | null;
      campusName?: string | null;
      hasLevelingLoad?: boolean;
      loadCourses?: number;
    }>;
  }>;
  pending: Array<{
    studentId: string;
    dni: string | null;
    fullName: string;
    codigoAlumno: string | null;
    careerName?: string | null;
    campusName?: string | null;
    reasonCode: 'SCHEDULE_CONFLICT' | 'NO_CAPACITY' | 'NO_ELIGIBLE_GROUP';
    reasonDetail: string | null;
  }>;
  suggestion?: {
    recommendedGroupCapacity: number;
    potentialCoveredIfAddOneGroup: number;
  };
}

export interface WorkshopAssignmentRun {
  runId: string;
  workshopId: string;
  periodId: string;
  createdAt: string;
  totalCandidates: number;
  groups: Array<{
    runGroupId: string;
    sourceGroupId: string | null;
    code: string | null;
    displayName: string | null;
    index: number;
    assignedCount: number;
    capacity: number | null;
    students: Array<{
      studentId: string;
      dni?: string | null;
      codigoAlumno: string | null;
      fullName: string;
      careerName: string | null;
      campusName: string | null;
    }>;
  }>;
  pending: Array<{
    id: string;
    studentId: string;
    dni?: string | null;
    codigoAlumno: string | null;
    fullName: string;
    careerName: string | null;
    campusName: string | null;
    reasonCode: 'SCHEDULE_CONFLICT' | 'NO_CAPACITY' | 'NO_ELIGIBLE_GROUP';
    reasonDetail: string | null;
  }>;
  summary: {
    assignedCount: number;
    pendingCount: number;
  };
}

export interface WorkshopAppliedView {
  workshop: WorkshopRow;
  run: {
    runId: string;
    workshopId: string;
    periodId: string;
    createdAt: string;
    totalCandidates: number;
  };
  groups: Array<{
    runGroupId: string;
    sourceGroupId: string | null;
    code: string | null;
    displayName: string | null;
    index: number;
    assignedCount: number;
    capacity: number | null;
    scheduleBlocks: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate?: string | null;
      endDate?: string | null;
    }>;
    students: Array<{
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      fullName: string;
      careerName: string | null;
      campusName: string | null;
    }>;
  }>;
  pending: WorkshopAssignmentRun['pending'];
  summary: {
    assignedCount: number;
    pendingCount: number;
    groupsCount: number;
    conflictingStudents: number;
    totalConflicts: number;
  };
  currentConflicts: Array<{
    workshopName: string;
    studentId: string;
    dni: string | null;
    codigoAlumno: string | null;
    fullName: string;
    careerName: string | null;
    campusName: string | null;
    runGroupId: string;
    sourceGroupId: string | null;
    groupName: string | null;
    workshopBlockText: string;
    levelingBlockText: string;
  }>;
}

export interface WorkshopStudentGroupOptionsResponse {
  runId: string;
  workshopId: string;
  student: {
    studentId: string;
    dni: string | null;
    codigoAlumno: string | null;
    fullName: string;
    careerName: string | null;
    campusName: string | null;
  };
  currentRunGroupId: string;
  groups: Array<{
    runGroupId: string;
    sourceGroupId: string | null;
    code: string | null;
    displayName: string | null;
    assignedCount: number;
    capacity: number | null;
    wouldBeOverCapacity: boolean;
    scheduleBlocks: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate?: string | null;
      endDate?: string | null;
    }>;
    hasConflict: boolean;
    conflictDetail: string | null;
    selectable: boolean;
    isCurrent: boolean;
  }>;
}

export interface WorkshopOptionsResponse {
  faculties: string[];
  campuses: string[];
  careers: string[];
}

export interface WorkshopStudentImportSummary {
  rowsRead: number;
  resolvedCount: number;
  duplicateCodes: string[];
  notFoundCodes: string[];
  ambiguousCodes: string[];
  emptyRows: number;
}

export interface WorkshopStudentImportResponse {
  students: WorkshopStudentRow[];
  summary: WorkshopStudentImportSummary;
}

export interface WorkshopSavePayload {
  name: string;
  mode: WorkshopMode;
  groupSize: number | null;
  selectionMode: SelectionMode;
  facultyGroups: string[];
  campusNames: string[];
  careerNames: string[];
  facultyGroup: string | null;
  campusName: string | null;
  careerName: string | null;
  deliveryMode: 'VIRTUAL' | 'PRESENCIAL';
  venueCampusName: string | null;
  responsibleTeacherId: string | null;
  studentIds: string[];
}

@Injectable({ providedIn: 'root' })
export class AdminWorkshopsService {
  private readonly http = inject(HttpClient);

  listWorkshops() {
    return firstValueFrom(this.http.get<WorkshopRow[]>('/api/admin/workshops'));
  }

  getWorkshop(id: string) {
    return firstValueFrom(
      this.http.get<WorkshopRow>(`/api/admin/workshops/${encodeURIComponent(id)}`)
    );
  }

  listFilters(snapshot: Pick<FilterSnapshot, 'facultyGroups' | 'campusNames'>) {
    return firstValueFrom(
      this.http.get<WorkshopOptionsResponse>('/api/admin/workshops/filters', {
        params: this.buildFiltersHttpParams(snapshot),
      })
    );
  }

  listStudents(snapshot: FilterSnapshot) {
    return firstValueFrom(
      this.http.get<WorkshopStudentRow[]>('/api/admin/workshops/students/list', {
        params: this.buildStudentsHttpParams(snapshot),
      })
    );
  }

  importStudentsByExcel(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return firstValueFrom(
      this.http.post<WorkshopStudentImportResponse>(
        '/api/admin/workshops/students/import-codes',
        formData
      )
    );
  }

  listTeachers() {
    return firstValueFrom(this.http.get<AdminTeacher[]>('/api/admin/teachers'));
  }

  saveWorkshop(workshopId: string | null, payload: WorkshopSavePayload) {
    if (workshopId) {
      return firstValueFrom(
        this.http.put<WorkshopRow>(
          `/api/admin/workshops/${encodeURIComponent(workshopId)}`,
          payload
        )
      );
    }
    return firstValueFrom(this.http.post<WorkshopRow>('/api/admin/workshops', payload));
  }

  updateWorkshopStatus(workshopId: string, isActive: boolean) {
    return firstValueFrom(
      this.http.patch<{ id: string; isActive: boolean }>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/status`,
        { isActive }
      )
    );
  }

  deleteWorkshop(workshopId: string) {
    return firstValueFrom(
      this.http.delete(`/api/admin/workshops/${encodeURIComponent(workshopId)}`)
    );
  }

  downloadGroupsExcel(workshopId: string) {
    return firstValueFrom(
      this.http.get(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/export/groups/excel`,
        { responseType: 'blob' }
      )
    );
  }

  listGroups(workshopId: string) {
    return firstValueFrom(
      this.http.get<WorkshopGroupRow[]>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/groups`
      )
    );
  }

  regenerateGroups(workshopId: string) {
    return firstValueFrom(
      this.http.post<WorkshopGroupRow[]>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/groups/regenerate`,
        {}
      )
    );
  }

  saveGroups(
    workshopId: string,
    groups: Array<{
      id?: string;
      code?: string | null;
      displayName: string;
      capacity?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    }>
  ) {
    return firstValueFrom(
      this.http.put<WorkshopGroupRow[]>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/groups`,
        { groups }
      )
    );
  }

  saveGroupSchedule(
    workshopId: string,
    groupId: string,
    blocks: GroupScheduleBlockRow[],
    forceConflicts = false
  ) {
    return firstValueFrom(
      this.http.put<WorkshopGroupScheduleSaveResponse>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/groups/${encodeURIComponent(groupId)}/schedule`,
        { blocks, forceConflicts }
      )
    );
  }

  updateGroupScheduleBlockMeetingLinks(
    workshopId: string,
    groupId: string,
    blockId: string,
    payload: {
      zoomMeetingRecordId?: string | null;
      joinUrl?: string | null;
      startUrl?: string | null;
    }
  ) {
    return firstValueFrom(
      this.http.put<GroupScheduleBlockRow[]>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/groups/${encodeURIComponent(groupId)}/schedule/${encodeURIComponent(blockId)}/meeting-links`,
        payload
      )
    );
  }

  refreshGroupScheduleBlockMeetingLinks(
    workshopId: string,
    groupId: string,
    blockId: string
  ) {
    return firstValueFrom(
      this.http.post<{ joinUrl: string | null; startUrl: string | null }>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/groups/${encodeURIComponent(groupId)}/schedule/${encodeURIComponent(blockId)}/refresh-meeting-links`,
        {}
      )
    );
  }

  previewAssignments(workshopId: string) {
    return firstValueFrom(
      this.http.post<WorkshopAssignmentPreview>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/assignments/preview`,
        {}
      )
    );
  }

  runAssignments(workshopId: string) {
    return firstValueFrom(
      this.http.post<{ runId: string } & WorkshopAssignmentPreview>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/assignments/run`,
        {}
      )
    );
  }

  getAssignmentRun(workshopId: string, runId: string) {
    return firstValueFrom(
      this.http.get<WorkshopAssignmentRun>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/assignments/${encodeURIComponent(runId)}`
      )
    );
  }

  getLatestAppliedView(workshopId: string) {
    return firstValueFrom(
      this.http.get<WorkshopAppliedView>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/assignments/latest/applied-view`
      )
    );
  }

  getAssignmentRunStudentGroupOptions(
    workshopId: string,
    runId: string,
    studentId: string
  ) {
    return firstValueFrom(
      this.http.get<WorkshopStudentGroupOptionsResponse>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/assignments/${encodeURIComponent(runId)}/students/${encodeURIComponent(studentId)}/group-options`
      )
    );
  }

  changeAssignmentRunStudentGroup(
    workshopId: string,
    runId: string,
    studentId: string,
    targetRunGroupId: string
  ) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/assignments/${encodeURIComponent(runId)}/students/${encodeURIComponent(studentId)}/change-group`,
        { targetRunGroupId }
      )
    );
  }

  createEmptyWorkshop(): WorkshopRow {
    return {
      id: '',
      name: '',
      mode: 'BY_SIZE',
      groupSize: 40,
      selectionMode: 'MANUAL',
      facultyGroup: null,
      campusName: null,
      careerName: null,
      facultyGroups: [],
      campusNames: [],
      careerNames: [],
      deliveryMode: 'VIRTUAL',
      venueCampusName: null,
      responsibleTeacherId: null,
      responsibleTeacherDni: null,
      responsibleTeacherName: null,
      isActive: true,
      studentIds: [],
      selectedStudents: [],
    };
  }

  buildInitialFilter(workshop: WorkshopRow): FilterSnapshot {
    return {
      facultyGroups:
        workshop.facultyGroups && workshop.facultyGroups.length > 0
          ? workshop.facultyGroups.slice()
          : workshop.facultyGroup
            ? [workshop.facultyGroup]
            : [],
      campusNames:
        workshop.campusNames && workshop.campusNames.length > 0
          ? workshop.campusNames.slice()
          : workshop.campusName
            ? [workshop.campusName]
            : [],
      careerNames:
        workshop.careerNames && workshop.careerNames.length > 0
          ? workshop.careerNames.slice()
          : workshop.careerName
            ? [workshop.careerName]
            : [],
    };
  }

  normalizeList(values: string[]) {
    return Array.from(
      new Set(
        values
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0)
      )
    );
  }

  clampSnapshotToOptions(snapshot: FilterSnapshot, options: WorkshopOptionsResponse): FilterSnapshot {
    const facultiesSet = new Set(options.faculties);
    const campusesSet = new Set(options.campuses);
    const careersSet = new Set(options.careers);
    return {
      facultyGroups: snapshot.facultyGroups.filter((value) => facultiesSet.has(value)),
      campusNames: snapshot.campusNames.filter((value) => campusesSet.has(value)),
      careerNames: snapshot.careerNames.filter((value) => careersSet.has(value)),
    };
  }

  private buildFiltersHttpParams(snapshot: Pick<FilterSnapshot, 'facultyGroups' | 'campusNames'>) {
    let params = new HttpParams();
    snapshot.facultyGroups.forEach((value) => (params = params.append('facultyGroup', value)));
    snapshot.campusNames.forEach((value) => (params = params.append('campusName', value)));
    return params;
  }

  private buildStudentsHttpParams(snapshot: FilterSnapshot) {
    let params = new HttpParams();
    snapshot.facultyGroups.forEach((value) => (params = params.append('facultyGroup', value)));
    snapshot.campusNames.forEach((value) => (params = params.append('campusName', value)));
    snapshot.careerNames.forEach((value) => (params = params.append('careerName', value)));
    return params;
  }
}
