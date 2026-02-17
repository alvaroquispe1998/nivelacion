import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { AdminScheduleBlock } from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import type { Subscription } from 'rxjs';
import { DAYS } from '../shared/days';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Horario de seccion</div>
        <div class="text-sm text-slate-600">Bloques (validacion de solapes en backend)</div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
      >
        Refrescar
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Curso</th>
              <th class="px-4 py-3">Dia</th>
              <th class="px-4 py-3">Hora</th>
              <th class="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of blocks" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ b.courseName }}</td>
              <td class="px-4 py-3">{{ dayLabel(b.dayOfWeek) }}</td>
              <td class="px-4 py-3 text-slate-700">{{ b.startTime }}-{{ b.endTime }}</td>
              <td class="px-4 py-3">
                <button
                  class="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  (click)="remove(b.id)"
                >
                  Eliminar
                </button>
              </td>
            </tr>
            <tr *ngIf="blocks.length===0" class="border-t border-slate-100">
              <td class="px-4 py-6 text-slate-600" colspan="4">Sin bloques</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Nuevo bloque</div>
        <form class="mt-3 space-y-2" [formGroup]="form" (ngSubmit)="create()">
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="courseName"
            placeholder="Curso"
          />
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="dayOfWeek"
          >
            <option *ngFor="let d of days" [value]="d.dayOfWeek">{{ d.label }}</option>
          </select>
          <div class="grid grid-cols-2 gap-2">
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="startTime"
              placeholder="Inicio (HH:mm)"
            />
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="endTime"
              placeholder="Fin (HH:mm)"
            />
          </div>
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="zoomUrl"
            placeholder="Zoom URL (opcional)"
          />
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="location"
            placeholder="Lugar (opcional)"
          />
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="form.invalid || loading"
          >
            {{ loading ? 'Creando...' : 'Crear' }}
          </button>
        </form>

        <div class="mt-2 text-xs text-slate-600">
          Nota: horas deben ser <code>:00</code> o <code>:30</code>.
        </div>
      </div>
    </div>
  `,
})
export class AdminSectionSchedulePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly days = DAYS;
  sectionId = '';
  private routeSub?: Subscription;

  blocks: AdminScheduleBlock[] = [];
  error: string | null = null;
  loading = false;

  form = this.fb.group({
    courseName: ['', [Validators.required]],
    dayOfWeek: [1, [Validators.required]],
    startTime: ['08:00', [Validators.required]],
    endTime: ['10:00', [Validators.required]],
    zoomUrl: [''],
    location: [''],
  });

  async ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      this.sectionId = String(params.get('id') ?? '');
      void this.load();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  dayLabel(dow: number) {
    return this.days.find((d) => d.dayOfWeek === dow)?.label ?? String(dow);
  }

  async load() {
    this.error = null;
    try {
      this.blocks = await firstValueFrom(
        this.http.get<AdminScheduleBlock[]>(
          `/api/admin/schedule-blocks?sectionId=${encodeURIComponent(this.sectionId)}`
        )
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar bloques';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async create() {
    this.loading = true;
    this.error = null;
    try {
      const v = this.form.value;
      await firstValueFrom(
        this.http.post('/api/admin/schedule-blocks', {
          sectionId: this.sectionId,
          courseName: String(v.courseName ?? '').trim(),
          dayOfWeek: Number(v.dayOfWeek ?? 1),
          startTime: String(v.startTime ?? ''),
          endTime: String(v.endTime ?? ''),
          zoomUrl: String(v.zoomUrl ?? '').trim() || null,
          location: String(v.location ?? '').trim() || null,
        })
      );
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear bloque';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async remove(id: string) {
    this.error = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/schedule-blocks/${id}`));
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar bloque';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
