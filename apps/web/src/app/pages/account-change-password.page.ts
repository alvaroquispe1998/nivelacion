import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthChangePasswordRequest } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="text-xl font-semibold">Cambiar contraseña</div>
      <div class="mt-1 text-sm text-slate-600">
        Actualiza tu contraseña de acceso al sistema.
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

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-700">
            Contraseña actual
          </span>
          <input
            type="password"
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="currentPassword"
            placeholder="********"
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-700">
            Nueva contraseña
          </span>
          <input
            type="password"
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="newPassword"
            placeholder="Mínimo 8 caracteres"
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-700">
            Confirmar nueva contraseña
          </span>
          <input
            type="password"
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="confirmPassword"
            placeholder="Repite la nueva contraseña"
          />
        </label>

        <button
          class="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          [disabled]="form.invalid || loading"
        >
          {{ loading ? 'Actualizando...' : 'Actualizar contraseña' }}
        </button>
      </form>
    </div>
  `,
})
export class AccountChangePasswordPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  loading = false;
  error: string | null = null;
  success: string | null = null;

  form = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(120)]],
    confirmPassword: ['', [Validators.required]],
  });

  async submit() {
    if (this.form.invalid) return;

    const currentPassword = String(this.form.value.currentPassword ?? '');
    const newPassword = String(this.form.value.newPassword ?? '');
    const confirmPassword = String(this.form.value.confirmPassword ?? '');

    if (newPassword !== confirmPassword) {
      this.error = 'La confirmación no coincide.';
      this.success = null;
      return;
    }

    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const payload: AuthChangePasswordRequest = { currentPassword, newPassword };
      await firstValueFrom(this.http.post('/api/auth/change-password', payload));
      this.success = 'Contraseña actualizada correctamente.';
      this.form.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar la contraseña';
    } finally {
      this.loading = false;
    }
  }
}
