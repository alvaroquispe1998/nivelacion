import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import type { AdminTeacher } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Docentes</div>
        <div class="text-sm text-slate-600">CRUD de docentes</div>
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
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Nuevo docente</div>
        <form class="mt-3 space-y-2" [formGroup]="createForm" (ngSubmit)="createTeacher()">
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="dni"
            placeholder="DNI"
          />
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="fullName"
            placeholder="Nombres y apellidos completos"
          />
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="createForm.invalid || loadingCreate"
          >
            {{ loadingCreate ? 'Guardando...' : 'Crear docente' }}
          </button>
        </form>
      </div>

      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">DNI</th>
              <th class="px-4 py-3">Nombres y apellidos</th>
              <th class="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of teachers; trackBy: trackTeacher" class="border-t border-slate-100">
              <td class="px-4 py-3">
                <input
                  class="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                  [(ngModel)]="draftFor(t.id).dni"
                />
              </td>
              <td class="px-4 py-3">
                <input
                  class="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                  [(ngModel)]="draftFor(t.id).fullName"
                />
              </td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    (click)="updateTeacher(t.id)"
                    [disabled]="loadingUpdateId === t.id"
                  >
                    {{ loadingUpdateId === t.id ? 'Guardando...' : 'Guardar' }}
                  </button>
                  <button
                    class="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    (click)="removeTeacher(t.id)"
                    [disabled]="loadingDeleteId === t.id"
                  >
                    {{ loadingDeleteId === t.id ? 'Eliminando...' : 'Eliminar' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="teachers.length === 0" class="border-t border-slate-100">
              <td class="px-4 py-5 text-slate-500" colspan="3">Sin docentes</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div *ngIf="confirmState.isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transform transition-all">
        <h3 class="text-lg font-semibold text-slate-900">{{ confirmState.title }}</h3>
        <p class="mt-2 text-sm text-slate-600 leading-relaxed">{{ confirmState.message }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            (click)="confirmState.isOpen = false"
          >
            Cancelar
          </button>
          <button
            class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
            (click)="confirmState.onConfirm()"
          >
            {{ confirmState.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminTeachersPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  teachers: AdminTeacher[] = [];
  drafts: Record<string, { dni: string; fullName: string }> = {};
  error: string | null = null;

  loadingCreate = false;
  loadingUpdateId: string | null = null;
  loadingDeleteId: string | null = null;

  confirmState = {
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    onConfirm: () => { },
  };

  createForm = this.fb.group({
    dni: ['', [Validators.required, Validators.pattern(/^\d{8,15}$/)]],
    fullName: ['', [Validators.required, Validators.maxLength(180)]],
  });

  async ngOnInit() {
    await this.load();
  }

  askConfirmation(title: string, message: string, onConfirm: () => void) {
    this.confirmState = {
      isOpen: true,
      title,
      message,
      confirmLabel: 'Continuar',
      onConfirm: () => {
        this.confirmState.isOpen = false;
        onConfirm();
      },
    };
  }

  trackTeacher(_: number, item: AdminTeacher) {
    return item.id;
  }

  draftFor(id: string) {
    if (!this.drafts[id]) this.drafts[id] = { dni: '', fullName: '' };
    return this.drafts[id];
  }

  async load() {
    this.error = null;
    try {
      this.teachers = await firstValueFrom(this.http.get<AdminTeacher[]>('/api/admin/teachers'));
      this.drafts = {};
      for (const t of this.teachers) {
        this.drafts[t.id] = { dni: t.dni, fullName: t.fullName };
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar docentes';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async createTeacher() {
    if (this.createForm.invalid) return;
    this.loadingCreate = true;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.post('/api/admin/teachers', {
          dni: String(this.createForm.value.dni ?? '').trim(),
          fullName: String(this.createForm.value.fullName ?? '').trim(),
        })
      );
      this.createForm.reset();
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear docente';
    } finally {
      this.loadingCreate = false;
      this.cdr.detectChanges();
    }
  }

  async updateTeacher(id: string) {
    this.loadingUpdateId = id;
    this.error = null;
    try {
      const d = this.draftFor(id);
      await firstValueFrom(
        this.http.patch(`/api/admin/teachers/${id}`, {
          dni: String(d.dni ?? '').trim(),
          fullName: String(d.fullName ?? '').trim(),
        })
      );
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar docente';
    } finally {
      this.loadingUpdateId = null;
      this.cdr.detectChanges();
    }
  }

  async removeTeacher(id: string) {
    this.askConfirmation(
      'Eliminar docente',
      'Se eliminara este docente. Deseas continuar?',
      () => this.executeRemoveTeacher(id)
    );
  }

  async executeRemoveTeacher(id: string) {
    this.loadingDeleteId = id;
    this.error = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/teachers/${id}`));
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar docente';
    } finally {
      this.loadingDeleteId = null;
      this.cdr.detectChanges();
    }
  }
}

