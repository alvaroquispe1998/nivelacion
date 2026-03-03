import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdminInternalUser,
  CreateAdminInternalUserRequest,
  ResetAdminInternalUserPasswordRequest,
  Role,
  UpdateAdminInternalUserRequest,
  UpdateAdminInternalUserStatusRequest,
} from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div class="text-xl font-semibold">Usuarios internos</div>
        <div class="text-sm text-slate-600">
          Gestion de cuentas ADMIN y ADMINISTRATIVO.
        </div>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          class="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          [(ngModel)]="query"
          placeholder="Buscar por DNI o nombre"
        />
        <select
          class="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          [(ngModel)]="roleFilter"
        >
          <option value="">Todos los roles</option>
          <option [value]="Role.ADMIN">Administrador</option>
          <option [value]="Role.ADMINISTRATIVO">Administrativo</option>
        </select>
        <select
          class="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          [(ngModel)]="statusFilter"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <button
          class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="load()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div
      *ngIf="error"
      class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <div
      *ngIf="success"
      class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ success }}
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Nuevo usuario interno</div>
        <form class="mt-3 space-y-3" [formGroup]="createForm" (ngSubmit)="createUser()">
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
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="role"
          >
            <option [value]="Role.ADMINISTRATIVO">Administrativo</option>
            <option [value]="Role.ADMIN">Administrador</option>
          </select>
          <input
            type="password"
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="password"
            placeholder="Password inicial"
          />
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="createForm.invalid || loadingCreate"
          >
            {{ loadingCreate ? 'Guardando...' : 'Crear usuario' }}
          </button>
        </form>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">DNI</th>
              <th class="px-4 py-3">Nombres y apellidos</th>
              <th class="px-4 py-3">Rol</th>
              <th class="px-4 py-3">Estado</th>
              <th class="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let user of filteredUsers; trackBy: trackUser"
              class="border-t border-slate-100"
              [class.bg-slate-50]="!user.isActive"
            >
              <td class="px-4 py-3 align-top">
                <input
                  class="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                  [(ngModel)]="draftFor(user.id).dni"
                />
              </td>
              <td class="px-4 py-3 align-top">
                <input
                  class="w-full min-w-64 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                  [(ngModel)]="draftFor(user.id).fullName"
                />
              </td>
              <td class="px-4 py-3 align-top">
                <select
                  class="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                  [(ngModel)]="draftFor(user.id).role"
                >
                  <option [value]="Role.ADMIN">Administrador</option>
                  <option [value]="Role.ADMINISTRATIVO">Administrativo</option>
                </select>
              </td>
              <td class="px-4 py-3 align-top">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                  [ngClass]="
                    user.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  "
                >
                  {{ user.isActive ? 'Activo' : 'Inactivo' }}
                </span>
              </td>
              <td class="px-4 py-3 align-top">
                <div class="flex flex-wrap gap-2">
                  <button
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    (click)="updateUser(user.id)"
                    [disabled]="loadingUpdateId === user.id"
                  >
                    {{ loadingUpdateId === user.id ? 'Guardando...' : 'Guardar' }}
                  </button>
                  <button
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    (click)="toggleStatus(user)"
                    [disabled]="loadingStatusId === user.id"
                  >
                    {{
                      loadingStatusId === user.id
                        ? 'Actualizando...'
                        : user.isActive
                          ? 'Desactivar'
                          : 'Activar'
                    }}
                  </button>
                  <button
                    class="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    (click)="openResetPasswordModal(user)"
                  >
                    Reset clave
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="filteredUsers.length === 0" class="border-t border-slate-100">
              <td class="px-4 py-5 text-slate-500" colspan="5">
                Sin usuarios internos
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      *ngIf="resetPasswordModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div class="text-lg font-semibold text-slate-900">Resetear password</div>
        <div class="mt-2 text-sm text-slate-600">
          Nuevo password para {{ resetPasswordTarget?.fullName }}.
        </div>
        <input
          type="password"
          class="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          [(ngModel)]="resetPasswordValue"
          placeholder="Nuevo password"
        />
        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            (click)="closeResetPasswordModal()"
          >
            Cancelar
          </button>
          <button
            class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="loadingResetPassword || resetPasswordValue.trim().length < 8"
            (click)="submitResetPassword()"
          >
            {{ loadingResetPassword ? 'Guardando...' : 'Actualizar' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminUsersPage {
  readonly Role = Role;

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  users: AdminInternalUser[] = [];
  drafts: Record<string, { dni: string; fullName: string; role: Role }> = {};
  query = '';
  roleFilter = '';
  statusFilter = '';
  error: string | null = null;
  success: string | null = null;

  loadingCreate = false;
  loadingUpdateId: string | null = null;
  loadingStatusId: string | null = null;
  loadingResetPassword = false;
  resetPasswordModalOpen = false;
  resetPasswordTarget: AdminInternalUser | null = null;
  resetPasswordValue = '';

  createForm = this.fb.group({
    dni: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9]{3,30}$/)]],
    fullName: ['', [Validators.required, Validators.maxLength(180)]],
    role: [Role.ADMINISTRATIVO, [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(120)]],
  });

  get filteredUsers() {
    const query = this.query.trim().toLowerCase();
    return this.users.filter((user) => {
      const matchesQuery =
        !query ||
        user.dni.toLowerCase().includes(query) ||
        user.fullName.toLowerCase().includes(query);
      const matchesRole = !this.roleFilter || user.role === this.roleFilter;
      const matchesStatus =
        !this.statusFilter ||
        (this.statusFilter === 'active' && user.isActive) ||
        (this.statusFilter === 'inactive' && !user.isActive);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }

  async ngOnInit() {
    await this.load();
  }

  trackUser(_: number, item: AdminInternalUser) {
    return item.id;
  }

  draftFor(id: string) {
    if (!this.drafts[id]) {
      this.drafts[id] = { dni: '', fullName: '', role: Role.ADMINISTRATIVO };
    }
    return this.drafts[id];
  }

  async load() {
    this.error = null;
    try {
      this.users = await firstValueFrom(
        this.http.get<AdminInternalUser[]>('/api/admin/users')
      );
      this.drafts = {};
      for (const user of this.users) {
        this.drafts[user.id] = {
          dni: user.dni,
          fullName: user.fullName,
          role: user.role,
        };
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar usuarios internos';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async createUser() {
    if (this.createForm.invalid) return;
    this.loadingCreate = true;
    this.error = null;
    this.success = null;
    try {
      const payload: CreateAdminInternalUserRequest = {
        dni: String(this.createForm.value.dni ?? '').trim(),
        fullName: String(this.createForm.value.fullName ?? '').trim(),
        role: (this.createForm.value.role ?? Role.ADMINISTRATIVO) as
          | Role.ADMIN
          | Role.ADMINISTRATIVO,
        password: String(this.createForm.value.password ?? ''),
      };
      await firstValueFrom(this.http.post('/api/admin/users', payload));
      this.createForm.reset({
        dni: '',
        fullName: '',
        role: Role.ADMINISTRATIVO,
        password: '',
      });
      this.success = 'Usuario interno creado.';
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear usuario';
    } finally {
      this.loadingCreate = false;
      this.cdr.detectChanges();
    }
  }

  async updateUser(id: string) {
    this.loadingUpdateId = id;
    this.error = null;
    this.success = null;
    try {
      const draft = this.draftFor(id);
      const payload: UpdateAdminInternalUserRequest = {
        dni: String(draft.dni ?? '').trim(),
        fullName: String(draft.fullName ?? '').trim(),
        role: draft.role as Role.ADMIN | Role.ADMINISTRATIVO,
      };
      await firstValueFrom(this.http.patch(`/api/admin/users/${id}`, payload));
      this.success = 'Usuario actualizado.';
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar usuario';
    } finally {
      this.loadingUpdateId = null;
      this.cdr.detectChanges();
    }
  }

  async toggleStatus(user: AdminInternalUser) {
    const nextIsActive = !user.isActive;
    const confirmed = window.confirm(
      nextIsActive
        ? `Se activara a ${user.fullName}. Deseas continuar?`
        : `Se desactivara a ${user.fullName}. Deseas continuar?`
    );
    if (!confirmed) return;

    this.loadingStatusId = user.id;
    this.error = null;
    this.success = null;
    try {
      const payload: UpdateAdminInternalUserStatusRequest = { isActive: nextIsActive };
      await firstValueFrom(
        this.http.patch(`/api/admin/users/${user.id}/status`, payload)
      );
      this.success = nextIsActive ? 'Usuario activado.' : 'Usuario desactivado.';
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar el estado';
    } finally {
      this.loadingStatusId = null;
      this.cdr.detectChanges();
    }
  }

  openResetPasswordModal(user: AdminInternalUser) {
    this.resetPasswordTarget = user;
    this.resetPasswordValue = '';
    this.resetPasswordModalOpen = true;
  }

  closeResetPasswordModal() {
    this.resetPasswordModalOpen = false;
    this.resetPasswordTarget = null;
    this.resetPasswordValue = '';
  }

  async submitResetPassword() {
    if (!this.resetPasswordTarget) return;
    this.loadingResetPassword = true;
    this.error = null;
    this.success = null;
    try {
      const payload: ResetAdminInternalUserPasswordRequest = {
        newPassword: this.resetPasswordValue,
      };
      await firstValueFrom(
        this.http.post(
          `/api/admin/users/${this.resetPasswordTarget.id}/reset-password`,
          payload
        )
      );
      this.success = 'Password restablecido.';
      this.closeResetPasswordModal();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo resetear el password';
    } finally {
      this.loadingResetPassword = false;
      this.cdr.detectChanges();
    }
  }
}
