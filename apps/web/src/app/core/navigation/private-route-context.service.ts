import { Injectable } from '@angular/core';

interface StudentAttendanceFocus {
  kind?: 'COURSE' | 'WORKSHOP';
  sectionCourseId?: string;
  applicationGroupId?: string;
}

interface StudentGradesFocus {
  sectionCourseId?: string;
}

interface TeacherWorkshopAttendanceFocus {
  applicationId?: string;
  applicationGroupId?: string;
}

interface TeacherSectionFocus {
  sectionCourseId?: string;
}

@Injectable({ providedIn: 'root' })
export class PrivateRouteContextService {
  private readonly keys = {
    studentAttendance: 'private-route-context:student-attendance',
    studentGrades: 'private-route-context:student-grades',
    teacherWorkshopAttendance: 'private-route-context:teacher-workshop-attendance',
    teacherSectionAttendance: 'private-route-context:teacher-section-attendance',
    teacherSectionGrades: 'private-route-context:teacher-section-grades',
  } as const;

  setStudentAttendanceFocus(value: StudentAttendanceFocus) {
    this.set(this.keys.studentAttendance, value);
  }

  getStudentAttendanceFocus() {
    return this.get<StudentAttendanceFocus>(this.keys.studentAttendance);
  }

  setStudentGradesFocus(value: StudentGradesFocus) {
    this.set(this.keys.studentGrades, value);
  }

  getStudentGradesFocus() {
    return this.get<StudentGradesFocus>(this.keys.studentGrades);
  }

  setTeacherWorkshopAttendanceFocus(value: TeacherWorkshopAttendanceFocus) {
    this.set(this.keys.teacherWorkshopAttendance, value);
  }

  getTeacherWorkshopAttendanceFocus() {
    return this.get<TeacherWorkshopAttendanceFocus>(this.keys.teacherWorkshopAttendance);
  }

  setTeacherSectionAttendanceFocus(value: TeacherSectionFocus) {
    this.set(this.keys.teacherSectionAttendance, value);
  }

  getTeacherSectionAttendanceFocus() {
    return this.get<TeacherSectionFocus>(this.keys.teacherSectionAttendance);
  }

  setTeacherSectionGradesFocus(value: TeacherSectionFocus) {
    this.set(this.keys.teacherSectionGrades, value);
  }

  getTeacherSectionGradesFocus() {
    return this.get<TeacherSectionFocus>(this.keys.teacherSectionGrades);
  }

  private set(key: string, value: unknown) {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(key, JSON.stringify(value ?? {}));
  }

  private get<T>(key: string): T | null {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}
