import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AdminSection, AdminTeacher } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

const COURSE_CONTEXT_STORAGE_KEY = 'admin.sections.selectedCourseName';
const FACULTY_FILTER_STORAGE_KEY = 'admin.sections.filter.faculty';
const CAMPUS_FILTER_STORAGE_KEY = 'admin.sections.filter.campus';
const COURSE_FILTER_STORAGE_KEY = 'admin.sections.filter.course';

interface SectionStudentRow {
  id: string;
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  courseName?: string | null;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">
          {{ viewMode === 'students' ? 'Alumnos por Sección' : 'Horarios y Docentes' }}
        </div>
        <div class="text-sm text-slate-600">
          {{ viewMode === 'students' ? 'Listado de alumnos por sección' : 'Gestión de horarios y asignación de docentes' }}
        </div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="reloadAll()"
      >
        Refrescar
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="text-sm font-semibold">Ver detalle por seccion ({{ sections.length }})</div>

      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        <label class="text-xs text-slate-700">
          Facultad *
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="facultyFilter"
            (ngModelChange)="onFacultyChange()"
          >
            <option value="">Seleccionar facultad</option>
            <option *ngFor="let f of faculties; trackBy: trackText" [value]="f">
              {{ f }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Sede *
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
            [(ngModel)]="campusFilter"
            (ngModelChange)="onCampusChange()"
            [disabled]="!facultyFilter"
          >
            <option value="">Seleccionar sede</option>
            <option *ngFor="let campus of campuses; trackBy: trackText" [value]="campus">
              {{ campus }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Curso *
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
            [(ngModel)]="courseFilter"
            (ngModelChange)="onCourseChange()"
            [disabled]="!campusFilter"
          >
            <option value="">Seleccionar curso</option>
            <option *ngFor="let c of courses; trackBy: trackText" [value]="c">
              {{ c }}
            </option>
          </select>
        </label>
      </div>

      <div
        *ngIf="!hasMandatoryFilters"
        class="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
      >
        Selecciona Facultad, Sede y Curso para mostrar alumnos por seccion-curso.
      </div>

      <div class="mt-3 overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Codigo</th>
              <th class="px-4 py-3">Facultad</th>
              <th class="px-4 py-3">Sede</th>
              <th class="px-4 py-3">Modalidad</th>
              <th class="px-4 py-3">Docente</th>
              <th class="px-4 py-3" *ngIf="viewMode === 'students'">Alumnos</th>
              <th class="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of sections; trackBy: trackSection" class="border-t border-slate-100">
              <td class="px-4 py-3 font-semibold">{{ s.code || s.name }}</td>
              <td class="px-4 py-3">
                <div>{{ s.facultyGroup || '-' }}</div>
                <div class="text-xs text-slate-600">{{ s.facultyName || '-' }}</div>
              </td>
              <td class="px-4 py-3">{{ s.campusName || '-' }}</td>
              <td class="px-4 py-3">{{ s.modality || '-' }}</td>
              <td class="px-4 py-3 text-xs">
                <div>{{ s.teacherName || '-' }}</div>
                <div class="text-slate-500" *ngIf="s.teacherDni">{{ s.teacherDni }}</div>
              </td>
              <td class="px-4 py-3 font-medium" *ngIf="viewMode === 'students'">{{ s.studentCount || 0 }}</td>
              <td class="px-4 py-3 text-xs">
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    (click)="openStudentsModal(s)"
                    [disabled]="loadingStudentsSectionId === s.id || !courseFilter"
                    *ngIf="viewMode === 'students'"
                  >
                    {{ loadingStudentsSectionId === s.id ? 'Cargando...' : 'Ver alumnos' }}
                  </button>
                  <a
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    [routerLink]="['/admin/sections', s.id, 'schedule']"
                    [queryParams]="courseFilter ? { courseName: courseFilter } : undefined"
                  >
                    Horario
                  </a>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="openTeacherModal(s)"
                  >
                    Docente
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="sections.length === 0 && hasMandatoryFilters" class="border-t border-slate-100">
              <td class="px-4 py-5 text-slate-500" colspan="7">Sin secciones para el filtro seleccionado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      *ngIf="studentsModalSection"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeStudentsModal()"
    >
      <div
        class="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">
              Alumnos de seccion {{ studentsModalSection.code || studentsModalSection.name }}
            </div>
            <div class="text-xs text-slate-600">
              {{ studentsModalSection.facultyGroup }} | {{ studentsModalSection.campusName }} |
              {{ studentsModalSection.modality }} | {{ modalCourseName || '-' }} | {{ studentsModalRows.length }} alumnos
            </div>
          </div>
          <div class="flex items-center gap-2">
            <a
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              [routerLink]="['/admin/sections', studentsModalSection.id, 'attendance']"
              [queryParams]="modalCourseName ? { courseName: modalCourseName } : undefined"
              (click)="closeStudentsModal()"
            >
              Ver asistencia
            </a>
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              (click)="closeStudentsModal()"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div class="max-h-[70vh] overflow-auto p-5">
          <table class="min-w-full text-sm">
            <thead class="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-2">Codigo alumno</th>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Curso</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let st of studentsModalRows; trackBy: trackStudentRow" class="border-t border-slate-100">
                <td class="px-3 py-2 text-xs">{{ studentCode(st.codigoAlumno) }}</td>
                <td class="px-3 py-2">{{ st.fullName }}</td>
                <td class="px-3 py-2 text-xs">{{ st.courseName || modalCourseName || '-' }}</td>
              </tr>
              <tr *ngIf="studentsModalRows.length === 0">
                <td class="px-3 py-4 text-slate-500" colspan="3">Sin alumnos en la seccion-curso</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      *ngIf="teacherModalSection"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeTeacherModal()"
    >
      <div
        class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">
              Asignar docente
            </div>
            <div class="text-xs text-slate-600">
              Seccion {{ teacherModalSection.code || teacherModalSection.name }} |
              Curso {{ courseFilter || '-' }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            (click)="closeTeacherModal()"
          >
            Cerrar
          </button>
        </div>
        <div class="space-y-3 p-5">
          <div class="text-xs text-slate-600" *ngIf="teacherModalSection.teacherName">
            Actual: <b>{{ teacherModalSection.teacherName }}</b>
          </div>
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            [(ngModel)]="teacherModalTeacherId"
          >
            <option *ngFor="let t of teachers; trackBy: trackTeacher" [value]="t.id">
              {{ t.fullName }} ({{ t.dni }})
            </option>
          </select>
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="!teacherModalTeacherId || loadingAssignId === teacherModalSection.id"
            (click)="saveTeacherAssignment()"
          >
            {{ loadingAssignId === teacherModalSection.id ? 'Guardando...' : 'Guardar docente' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminSectionsPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);

  sections: AdminSection[] = [];
  teachers: AdminTeacher[] = [];
  faculties: string[] = [];
  campuses: string[] = [];
  courses: string[] = [];
  error: string | null = null;

  facultyFilter = '';
  campusFilter = '';
  courseFilter = '';

  studentsModalSection: AdminSection | null = null;
  studentsModalRows: SectionStudentRow[] = [];
  modalCourseName = '';
  loadingStudentsSectionId: string | null = null;

  teacherModalSection: AdminSection | null = null;
  teacherModalTeacherId = '';
  loadingAssignId: string | null = null;

  get hasMandatoryFilters() {
    return Boolean(this.facultyFilter && this.campusFilter && this.courseFilter);
  }

  viewMode: 'schedule' | 'students' = 'schedule';

  async ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.viewMode = params['view'] === 'students' ? 'students' : 'schedule';
      this.reloadAll();
    });
  }

  trackSection(_: number, item: AdminSection) {
    return item.id;
  }

  trackTeacher(_: number, item: AdminTeacher) {
    return item.id;
  }

  trackText(_: number, item: string) {
    return item;
  }

  trackStudentRow(_: number, item: SectionStudentRow) {
    return item.id;
  }

  studentCode(code: string | null | undefined) {
    const value = String(code ?? '').trim();
    return value || 'SIN CODIGO';
  }

  async reloadAll() {
    this.error = null;
    this.sections = [];
    this.campuses = [];
    this.courses = [];
    this.closeStudentsModal();
    this.closeTeacherModal();
    if (!this.facultyFilter && !this.campusFilter && !this.courseFilter) {
      this.restoreFiltersFromStorage();
    }
    try {
      const [faculties, teachers] = await Promise.all([
        firstValueFrom(this.http.get<string[]>('/api/admin/sections/filters/faculties')),
        firstValueFrom(this.http.get<AdminTeacher[]>('/api/admin/teachers')),
      ]);
      this.faculties = faculties;
      this.teachers = teachers;

      if (
        this.facultyFilter &&
        !this.faculties.some((f) => this.textKey(f) === this.textKey(this.facultyFilter))
      ) {
        this.facultyFilter = '';
        this.campusFilter = '';
        this.courseFilter = '';
      }

      if (this.facultyFilter) {
        await this.loadCampusesForCurrentFaculty();
      }

      if (
        this.campusFilter &&
        !this.campuses.some((c) => this.textKey(c) === this.textKey(this.campusFilter))
      ) {
        this.campusFilter = '';
        this.courseFilter = '';
      }

      if (this.facultyFilter && this.campusFilter) {
        await this.loadCoursesForCurrentCampus();
      }

      if (
        this.courseFilter &&
        !this.courses.some((c) => this.textKey(c) === this.textKey(this.courseFilter))
      ) {
        this.courseFilter = '';
      }

      this.persistFilters();
      if (this.hasMandatoryFilters) {
        await this.loadSections();
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar configuracion de secciones';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onFacultyChange() {
    this.error = null;
    this.sections = [];
    this.courses = [];
    this.campusFilter = '';
    this.courseFilter = '';
    this.closeStudentsModal();
    this.persistFilters();
    if (!this.facultyFilter) {
      this.campuses = [];
      this.persistFilters();
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadCampusesForCurrentFaculty();
      this.persistFilters();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar sedes';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onCampusChange() {
    this.error = null;
    this.sections = [];
    this.courseFilter = '';
    this.closeStudentsModal();
    this.persistFilters();
    if (!this.facultyFilter || !this.campusFilter) {
      this.courses = [];
      this.persistFilters();
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadCoursesForCurrentCampus();
      this.persistFilters();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar cursos';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onCourseChange() {
    this.persistFilters();
    this.persistSelectedCourse(this.courseFilter);
    this.closeStudentsModal();
    if (!this.hasMandatoryFilters) {
      this.sections = [];
      this.cdr.detectChanges();
      return;
    }
    await this.loadSections();
  }

  private async loadCampusesForCurrentFaculty() {
    const params = new HttpParams().set('facultyGroup', this.facultyFilter);
    this.campuses = await firstValueFrom(
      this.http.get<string[]>('/api/admin/sections/filters/campuses', { params })
    );
  }

  private async loadCoursesForCurrentCampus() {
    const params = new HttpParams()
      .set('facultyGroup', this.facultyFilter)
      .set('campusName', this.campusFilter);
    this.courses = await firstValueFrom(
      this.http.get<string[]>('/api/admin/sections/filters/courses', { params })
    );
  }

  private async loadSections() {
    this.error = null;
    try {
      const params = new HttpParams()
        .set('facultyGroup', this.facultyFilter)
        .set('campusName', this.campusFilter)
        .set('courseName', this.courseFilter);
      this.sections = await firstValueFrom(
        this.http.get<AdminSection[]>('/api/admin/sections', { params })
      );
    } catch (e: any) {
      this.sections = [];
      this.error = e?.error?.message ?? 'No se pudo cargar secciones';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async openStudentsModal(section: AdminSection) {
    if (!this.courseFilter) return;
    this.loadingStudentsSectionId = section.id;
    this.error = null;
    try {
      const params = new HttpParams().set('courseName', this.courseFilter);
      const rows = await firstValueFrom(
        this.http.get<SectionStudentRow[]>(`/api/admin/sections/${section.id}/students`, { params })
      );
      this.studentsModalSection = section;
      this.studentsModalRows = rows;
      this.modalCourseName = this.courseFilter;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar alumnos de la seccion';
    } finally {
      this.loadingStudentsSectionId = null;
      this.cdr.detectChanges();
    }
  }

  closeStudentsModal() {
    this.studentsModalSection = null;
    this.studentsModalRows = [];
    this.modalCourseName = '';
  }

  openTeacherModal(section: AdminSection) {
    if (!this.courseFilter) {
      this.error = 'Selecciona un curso para asignar docente por seccion-curso.';
      this.cdr.detectChanges();
      return;
    }
    if (this.teachers.length === 0) {
      this.error = 'No hay docentes registrados. Primero crea docentes en la opcion Docentes.';
      this.cdr.detectChanges();
      return;
    }
    this.teacherModalSection = section;
    this.teacherModalTeacherId = section.teacherId ?? this.teachers[0].id;
  }

  closeTeacherModal() {
    this.teacherModalSection = null;
    this.teacherModalTeacherId = '';
  }

  async saveTeacherAssignment() {
    if (!this.teacherModalSection || !this.teacherModalTeacherId || !this.courseFilter) return;
    this.loadingAssignId = this.teacherModalSection.id;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/sections/${this.teacherModalSection.id}/course-teacher`, {
          courseName: this.courseFilter,
          teacherId: this.teacherModalTeacherId,
        })
      );
      await this.loadSections();
      this.closeTeacherModal();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo asignar docente';
    } finally {
      this.loadingAssignId = null;
      this.cdr.detectChanges();
    }
  }

  private restoreFiltersFromStorage() {
    if (typeof window === 'undefined') return;
    this.facultyFilter = String(window.localStorage.getItem(FACULTY_FILTER_STORAGE_KEY) ?? '').trim();
    this.campusFilter = String(window.localStorage.getItem(CAMPUS_FILTER_STORAGE_KEY) ?? '').trim();
    this.courseFilter = String(window.localStorage.getItem(COURSE_FILTER_STORAGE_KEY) ?? '').trim();
  }

  private persistFilters() {
    if (typeof window === 'undefined') return;
    this.setStorageValue(FACULTY_FILTER_STORAGE_KEY, this.facultyFilter);
    this.setStorageValue(CAMPUS_FILTER_STORAGE_KEY, this.campusFilter);
    this.setStorageValue(COURSE_FILTER_STORAGE_KEY, this.courseFilter);
  }

  private setStorageValue(key: string, value: string) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      window.localStorage.setItem(key, trimmed);
      return;
    }
    window.localStorage.removeItem(key);
  }

  private textKey(value: string) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  private persistSelectedCourse(courseName: string) {
    if (typeof window === 'undefined') return;
    const value = String(courseName ?? '').trim();
    if (value) {
      window.localStorage.setItem(COURSE_CONTEXT_STORAGE_KEY, value);
      return;
    }
    window.localStorage.removeItem(COURSE_CONTEXT_STORAGE_KEY);
  }
}
