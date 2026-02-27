import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GradeSchemeResponse } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-xl font-semibold">Configuracion de notas</div>
            <div class="text-sm text-slate-600">
              Administra componentes y ponderaciones del periodo.
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              (click)="loadScheme()"
            >
              Refrescar
            </button>
            <button
              class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="!scheme"
              (click)="openConfigModal()"
            >
              Configuracion
            </button>
          </div>
        </div>
      </div>

      <div *ngIf="error" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ error }}
      </div>
      <div *ngIf="success" class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {{ success }}
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        Usa el boton <b>Configuracion</b> para editar DIAGNOSTICO, FK1, FK2 y PARCIAL.
      </div>
    </div>

    <div
      *ngIf="configModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeConfigModal()"
    >
      <div
        class="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">Configuracion de componentes</div>
            <div class="text-xs text-slate-600">Escala 0-20 y pesos del periodo.</div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            (click)="closeConfigModal()"
          >
            Cerrar
          </button>
        </div>

        <div class="p-5">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th class="px-3 py-2">Componente</th>
                  <th class="px-3 py-2">Nombre</th>
                  <th class="px-3 py-2">Peso %</th>
                  <th class="px-3 py-2">Min</th>
                  <th class="px-3 py-2">Max</th>
                  <th class="px-3 py-2">Activo</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let c of draftSchemeComponents; trackBy: trackComponent" class="border-t border-slate-100">
                  <td class="px-3 py-2 font-semibold">{{ c.code }}</td>
                  <td class="px-3 py-2">
                    <input
                      class="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      [(ngModel)]="c.name"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      [(ngModel)]="c.weight"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.01"
                      class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      [(ngModel)]="c.minScore"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.01"
                      class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      [(ngModel)]="c.maxScore"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input type="checkbox" [(ngModel)]="c.isActive" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              (click)="closeConfigModal()"
            >
              Cancelar
            </button>
            <button
              class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="draftSchemeComponents.length === 0 || savingScheme"
              (click)="saveScheme()"
            >
              {{ savingScheme ? 'Guardando...' : 'Guardar configuracion' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminGradeConfigPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  error: string | null = null;
  success: string | null = null;

  scheme: GradeSchemeResponse | null = null;
  draftSchemeComponents: GradeSchemeResponse['components'] = [];
  savingScheme = false;
  configModalOpen = false;

  async ngOnInit() {
    await this.loadScheme();
  }

  trackComponent(_: number, item: { id: string }) {
    return item.id;
  }

  openConfigModal() {
    if (!this.scheme) return;
    this.error = null;
    this.success = null;
    this.draftSchemeComponents = this.scheme.components.map((c) => ({ ...c }));
    this.configModalOpen = true;
  }

  closeConfigModal() {
    this.configModalOpen = false;
    this.draftSchemeComponents = [];
  }

  async loadScheme() {
    this.error = null;
    this.success = null;
    try {
      this.scheme = await firstValueFrom(this.http.get<GradeSchemeResponse>('/api/admin/grades/scheme'));
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudo cargar la configuracion de notas.');
      this.scheme = null;
    } finally {
      this.cdr.detectChanges();
    }
  }

  async saveScheme() {
    if (this.draftSchemeComponents.length === 0) return;
    this.error = null;
    this.success = null;
    this.savingScheme = true;
    try {
      this.scheme = await firstValueFrom(
        this.http.put<GradeSchemeResponse>('/api/admin/grades/scheme', {
          components: this.draftSchemeComponents.map((x) => ({
            code: x.code,
            name: String(x.name ?? '').trim(),
            weight: Number(x.weight ?? 0),
            orderIndex: Number(x.orderIndex ?? 0),
            minScore: Number(x.minScore ?? 0),
            maxScore: Number(x.maxScore ?? 20),
            isActive: Boolean(x.isActive),
          })),
        })
      );
      this.success = 'Configuracion de notas guardada.';
      this.closeConfigModal();
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudo guardar la configuracion de notas.');
    } finally {
      this.savingScheme = false;
      this.cdr.detectChanges();
    }
  }

  private extractError(error: any, fallback: string) {
    const err = error?.error;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    if (err?.message && typeof err.message === 'object') {
      return JSON.stringify(err.message);
    }
    return String(error?.message ?? fallback);
  }
}
