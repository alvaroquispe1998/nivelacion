import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ZoomConfigView, ZoomHostGroup } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Configuración de Zoom</div>
        <div class="text-sm text-slate-600">Credenciales, grupos de hosts y conexión con Zoom API</div>
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
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {{ success }}
    </div>

    <!-- ── Credentials + Connection Test ─────────────────────────────── -->
    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Credenciales Zoom (Server-to-Server OAuth)</div>
        <form class="mt-3 space-y-3" [formGroup]="configForm" (ngSubmit)="saveConfig()">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Account ID</label>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="accountId"
                placeholder="Account ID de Zoom"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Client ID</label>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="clientId"
                placeholder="Client ID"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Client Secret</label>
            <input
              type="password"
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="clientSecret"
              placeholder="Client Secret (dejar vacío para mantener actual)"
            />
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Max Concurrentes</label>
              <input
                type="number"
                min="1"
                max="10"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="maxConcurrent"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Page Size</label>
              <input
                type="number"
                min="1"
                max="300"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="pageSize"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Timezone</label>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="timezone"
              />
            </div>
          </div>

          <button
            class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="configForm.invalid || savingConfig"
          >
            {{ savingConfig ? 'Guardando...' : 'Guardar credenciales' }}
          </button>
        </form>
      </div>

      <!-- Connection test card -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Estado de conexión</div>

        <div class="mt-3 space-y-3">
          <div
            class="rounded-xl border px-3 py-2 text-sm"
            [ngClass]="
              testResult === null
                ? 'border-slate-200 bg-slate-50 text-slate-600'
                : testResult.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
            "
          >
            {{ testResult === null ? 'No probado aún' : testResult.message }}
          </div>

          <button
            class="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
            (click)="testConnection()"
            [disabled]="testingConnection"
          >
            {{ testingConnection ? 'Probando...' : 'Probar conexión' }}
          </button>

          <div *ngIf="licensedUsersCount !== null" class="text-xs text-slate-500">
            Usuarios con licencia: <span class="font-semibold text-slate-800">{{ licensedUsersCount }}</span>
          </div>

          <button
            class="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            (click)="loadLicensedUsers()"
            [disabled]="loadingLicensed"
          >
            {{ loadingLicensed ? 'Cargando...' : 'Ver usuarios con licencia' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Host Groups ───────────────────────────────────────────────── -->
    <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold">Grupos de Hosts</div>
          <div class="text-xs text-slate-500">Organice los hosts de Zoom por grupo (Pregrado, Posgrado, Nivelación, etc.)</div>
        </div>
      </div>

      <!-- Create group form -->
      <div class="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Nombre del grupo</label>
          <input
            class="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            [(ngModel)]="newGroupName"
            placeholder="ej: PREGRADO"
          />
        </div>
        <button
          class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          [disabled]="!newGroupName.trim() || creatingGroup"
          (click)="createGroup()"
        >
          {{ creatingGroup ? 'Creando...' : 'Crear grupo' }}
        </button>
      </div>

      <!-- Groups list -->
      <div class="mt-4 space-y-3">
        <div
          *ngFor="let group of groups; trackBy: trackGroup"
          class="rounded-xl border border-slate-200 overflow-hidden"
        >
          <!-- Group header -->
          <div
            class="flex items-center justify-between bg-slate-50 px-4 py-2.5 cursor-pointer"
            (click)="toggleGroupOpen(group.id)"
          >
            <div class="flex items-center gap-2">
              <svg
                class="h-4 w-4 text-slate-400 transition-transform"
                [ngClass]="isGroupOpen(group.id) ? 'rotate-90' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <span class="text-sm font-semibold text-slate-800">{{ group.name }}</span>
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                [ngClass]="group.status === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
              >
                {{ group.status }}
              </span>
              <span class="text-xs text-slate-400">
                ({{ (group.hosts || []).length }} hosts)
              </span>
            </div>
            <div class="flex gap-1" (click)="$event.stopPropagation()">
              <button
                class="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                (click)="toggleGroupStatus(group)"
              >
                {{ group.status === 'ACTIVO' ? 'Inactivar' : 'Activar' }}
              </button>
              <button
                class="rounded-lg border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                (click)="deleteGroup(group.id)"
              >
                Eliminar
              </button>
            </div>
          </div>

          <!-- Group body (hosts) -->
          <div *ngIf="isGroupOpen(group.id)" class="px-4 py-3 space-y-2 border-t border-slate-100">
            <!-- Existing hosts -->
            <div
              *ngFor="let host of group.hosts || []; trackBy: trackHost"
              class="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-700">{{ host.email }}</span>
                <span
                  class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  [ngClass]="host.status === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                >
                  {{ host.status }}
                </span>
              </div>
              <div class="flex gap-1">
                <button
                  class="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                  (click)="toggleHostStatus(host)"
                >
                  {{ host.status === 'ACTIVO' ? 'Inactivar' : 'Activar' }}
                </button>
                <button
                  class="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                  (click)="deleteHost(host.id)"
                >
                  Eliminar
                </button>
              </div>
            </div>

            <div *ngIf="(group.hosts || []).length === 0" class="text-xs text-slate-400 py-1">
              Sin hosts en este grupo
            </div>

            <!-- Add host form -->
            <div class="flex items-end gap-2 pt-1">
              <input
                class="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                [(ngModel)]="newHostEmailFor[group.id]"
                placeholder="email@dominio.com"
                type="email"
              />
              <button
                class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                [disabled]="!newHostEmailFor[group.id]?.trim() || addingHostGroupId === group.id"
                (click)="addHost(group.id)"
              >
                {{ addingHostGroupId === group.id ? 'Agregando...' : 'Agregar host' }}
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="groups.length === 0 && !loading" class="text-sm text-slate-500 py-2">
          No hay grupos creados. Cree uno para empezar a agregar hosts.
        </div>
      </div>
    </div>
  `,
})
export class AdminZoomConfigPage {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  configForm = this.fb.group({
    accountId: ['', Validators.required],
    clientId: ['', Validators.required],
    clientSecret: [''],
    maxConcurrent: [2],
    pageSize: [20],
    timezone: ['America/Lima'],
  });

  // State
  loading = false;
  error = '';
  success = '';
  savingConfig = false;
  testingConnection = false;
  testResult: { ok: boolean; message: string } | null = null;
  licensedUsersCount: number | null = null;
  loadingLicensed = false;

  // Groups
  groups: ZoomHostGroup[] = [];
  openGroupIds = new Set<string>();
  newGroupName = '';
  creatingGroup = false;
  newHostEmailFor: Record<string, string> = {};
  addingHostGroupId: string | null = null;

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const [config, groups] = await Promise.all([
        firstValueFrom(this.http.get<ZoomConfigView>('/api/admin/zoom/config')),
        firstValueFrom(this.http.get<ZoomHostGroup[]>('/api/admin/zoom/config/host-groups')),
      ]);

      this.configForm.patchValue({
        accountId: config.accountId,
        clientId: config.clientId,
        clientSecret: '',
        maxConcurrent: config.maxConcurrent,
        pageSize: config.pageSize,
        timezone: config.timezone,
      });
      this.groups = groups;
    } catch (e: any) {
      this.error = e?.error?.message ?? e?.message ?? 'Error al cargar configuración';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async saveConfig() {
    this.savingConfig = true;
    this.error = '';
    this.success = '';
    try {
      const val = this.configForm.value;
      const body: Record<string, unknown> = {
        accountId: val.accountId,
        clientId: val.clientId,
        maxConcurrent: val.maxConcurrent,
        pageSize: val.pageSize,
        timezone: val.timezone,
      };
      // Only send secret if user typed something
      if (val.clientSecret && val.clientSecret.trim()) {
        body['clientSecret'] = val.clientSecret;
      }
      await firstValueFrom(this.http.put('/api/admin/zoom/config', body));
      this.success = 'Credenciales guardadas correctamente';
      this.configForm.patchValue({ clientSecret: '' });
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al guardar';
    } finally {
      this.savingConfig = false;
      this.cdr.markForCheck();
    }
  }

  async testConnection() {
    this.testingConnection = true;
    this.testResult = null;
    try {
      this.testResult = await firstValueFrom(
        this.http.get<{ ok: boolean; message: string }>('/api/admin/zoom/config/test'),
      );
    } catch (e: any) {
      this.testResult = { ok: false, message: e?.error?.message ?? 'Error de conexión' };
    } finally {
      this.testingConnection = false;
      this.cdr.markForCheck();
    }
  }

  async loadLicensedUsers() {
    this.loadingLicensed = true;
    try {
      const res = await firstValueFrom(
        this.http.get<{ total: number }>('/api/admin/zoom/meetings/users/licensed'),
      );
      this.licensedUsersCount = res.total;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al obtener usuarios';
    } finally {
      this.loadingLicensed = false;
      this.cdr.markForCheck();
    }
  }

  // ── Groups ────────────────────────────────────────────────────────────

  async createGroup() {
    const name = this.newGroupName.trim();
    if (!name) return;
    this.creatingGroup = true;
    try {
      await firstValueFrom(this.http.post('/api/admin/zoom/config/host-groups', { name }));
      this.newGroupName = '';
      await this.loadGroups();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al crear grupo';
    } finally {
      this.creatingGroup = false;
      this.cdr.markForCheck();
    }
  }

  async toggleGroupStatus(group: ZoomHostGroup) {
    const newStatus = group.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/zoom/config/host-groups/${group.id}`, { status: newStatus }),
      );
      await this.loadGroups();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al actualizar grupo';
    }
  }

  async deleteGroup(id: string) {
    if (!confirm('¿Eliminar este grupo y todos sus hosts?')) return;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/zoom/config/host-groups/${id}`));
      this.openGroupIds.delete(id);
      await this.loadGroups();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al eliminar grupo';
    }
  }

  // ── Hosts ─────────────────────────────────────────────────────────────

  async addHost(groupId: string) {
    const email = (this.newHostEmailFor[groupId] ?? '').trim();
    if (!email) return;
    this.addingHostGroupId = groupId;
    try {
      await firstValueFrom(
        this.http.post(`/api/admin/zoom/config/host-groups/${groupId}/hosts`, { email }),
      );
      this.newHostEmailFor[groupId] = '';
      await this.loadGroups();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al agregar host';
    } finally {
      this.addingHostGroupId = null;
      this.cdr.markForCheck();
    }
  }

  async toggleHostStatus(host: { id: string; status: string }) {
    const newStatus = host.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/zoom/config/hosts/${host.id}`, { status: newStatus }),
      );
      await this.loadGroups();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al actualizar host';
    }
  }

  async deleteHost(id: string) {
    if (!confirm('¿Eliminar este host?')) return;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/zoom/config/hosts/${id}`));
      await this.loadGroups();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al eliminar host';
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async loadGroups() {
    try {
      this.groups = await firstValueFrom(
        this.http.get<ZoomHostGroup[]>('/api/admin/zoom/config/host-groups'),
      );
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  toggleGroupOpen(id: string) {
    if (this.openGroupIds.has(id)) this.openGroupIds.delete(id);
    else this.openGroupIds.add(id);
  }

  isGroupOpen(id: string) {
    return this.openGroupIds.has(id);
  }

  trackGroup(_: number, g: ZoomHostGroup) { return g.id; }
  trackHost(_: number, h: { id: string }) { return h.id; }
}
