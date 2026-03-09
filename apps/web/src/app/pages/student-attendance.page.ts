import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PrivateRouteContextService } from '../core/navigation/private-route-context.service';

interface StudentAttendanceItem {
  kind?: 'COURSE' | 'WORKSHOP';
  courseName: string;
  sessionDate: string;
  status: 'ASISTIO' | 'FALTO';
  sectionCourseId?: string | null;
  sectionName?: string | null;
  applicationId?: string | null;
  applicationGroupId?: string | null;
  groupName?: string | null;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Asistencia</div>
        <div class="text-sm text-slate-600">Historial de sesiones</div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
      >
        Refrescar
      </button>
    </div>

    <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label class="block max-w-md">
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {{ selectorLabel() }}
        </div>
        <select
          class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          [(ngModel)]="selectedCourse"
          [disabled]="hasLockedTarget"
        >
          <option *ngIf="!hasLockedTarget" [ngValue]="allCoursesOption">{{ allOptionLabel() }}</option>
          <option *ngFor="let c of visibleCourseOptions; trackBy: trackText" [ngValue]="c">
            {{ c }}
          </option>
        </select>
      </label>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th class="px-4 py-3">Tipo</th>
            <th class="px-4 py-3">Curso</th>
            <th class="px-4 py-3">Grupo / Seccion</th>
            <th class="px-4 py-3">Fecha</th>
            <th class="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let it of filteredItems" class="border-t border-slate-100">
            <td class="px-4 py-3">
              <span
                class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                [class.bg-sky-100]="itemKind(it) === 'COURSE'"
                [class.text-sky-700]="itemKind(it) === 'COURSE'"
                [class.bg-emerald-100]="itemKind(it) === 'WORKSHOP'"
                [class.text-emerald-700]="itemKind(it) === 'WORKSHOP'"
              >
                {{ itemKind(it) === 'WORKSHOP' ? 'Taller' : 'Curso' }}
              </span>
            </td>
            <td class="px-4 py-3 font-medium">{{ it.courseName }}</td>
            <td class="px-4 py-3 text-slate-700">{{ secondaryLabel(it) }}</td>
            <td class="px-4 py-3 text-slate-700">{{ it.sessionDate }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                [class.bg-emerald-100]="it.status==='ASISTIO'"
                [class.text-emerald-800]="it.status==='ASISTIO'"
                [class.bg-rose-100]="it.status==='FALTO'"
                [class.text-rose-800]="it.status==='FALTO'"
              >
                {{ it.status }}
              </span>
            </td>
          </tr>
          <tr *ngIf="filteredItems.length===0" class="border-t border-slate-100">
            <td class="px-4 py-6 text-slate-600" colspan="5">Sin registros</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class StudentAttendancePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeContext = inject(PrivateRouteContextService);

  items: StudentAttendanceItem[] = [];
  courseOptions: string[] = [];
  selectedCourse = '__ALL__';
  readonly allCoursesOption = '__ALL__';
  error: string | null = null;
  focusKind = '';
  focusSectionCourseId = '';
  focusApplicationGroupId = '';

  get filteredItems() {
    return this.visibleItems.filter((item) => {
      if (this.selectedCourse !== this.allCoursesOption && item.courseName !== this.selectedCourse) {
        return false;
      }
      if (this.focusSectionCourseId && item.sectionCourseId !== this.focusSectionCourseId) {
        return false;
      }
      if (
        this.focusApplicationGroupId &&
        item.applicationGroupId !== this.focusApplicationGroupId
      ) {
        return false;
      }
      return true;
    });
  }

  get visibleItems() {
    return this.items.filter((item) => {
      if (!this.focusKind) return true;
      return String(item.kind ?? 'COURSE').trim().toUpperCase() === this.focusKind;
    });
  }

  get visibleCourseOptions() {
    return Array.from(
      new Set(
        this.visibleItems
          .map((x) => String(x.courseName ?? '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }

  get hasLockedTarget() {
    return Boolean(this.focusSectionCourseId || this.focusApplicationGroupId);
  }

  async ngOnInit() {
    const context = this.routeContext.getStudentAttendanceFocus();
    this.focusKind = String(context?.kind ?? '').trim().toUpperCase();
    this.focusSectionCourseId = String(context?.sectionCourseId ?? '').trim();
    this.focusApplicationGroupId = String(context?.applicationGroupId ?? '').trim();
    if (this.route.snapshot.queryParamMap.keys.length > 0) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });
    }
    await this.load();
  }

  trackText(_: number, item: string) {
    return item;
  }

  itemKind(item: StudentAttendanceItem) {
    return String(item.kind ?? 'COURSE').trim().toUpperCase() === 'WORKSHOP'
      ? 'WORKSHOP'
      : 'COURSE';
  }

  selectorLabel() {
    if (this.focusKind === 'COURSE') return 'Curso';
    if (this.focusKind === 'WORKSHOP') return 'Taller';
    return 'Curso o taller';
  }

  allOptionLabel() {
    if (this.focusKind === 'COURSE') return 'Todos los cursos';
    if (this.focusKind === 'WORKSHOP') return 'Todos los talleres';
    return 'Todos los cursos y talleres';
  }

  secondaryLabel(item: StudentAttendanceItem) {
    if (this.itemKind(item) === 'WORKSHOP') {
      return String(item.groupName ?? '').trim() || 'Grupo';
    }
    return String(item.sectionName ?? '').trim() || 'Seccion';
  }

  async load() {
    this.error = null;
    try {
      this.items = await firstValueFrom(
        this.http.get<StudentAttendanceItem[]>('/api/student/attendance')
      );
      this.courseOptions = Array.from(
        new Set(
          this.items
            .map((x) => String(x.courseName ?? '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));
      if (this.hasLockedTarget) {
        this.selectedCourse = this.visibleCourseOptions[0] ?? this.allCoursesOption;
      }
      if (
        this.selectedCourse !== this.allCoursesOption &&
        !this.visibleCourseOptions.includes(this.selectedCourse)
      ) {
        this.selectedCourse = this.allCoursesOption;
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar la asistencia';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
