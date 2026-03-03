import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { isAdminBackofficeRole, Role } from '@uai/shared';
import { TimeoutError } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="p-6 border-b border-slate-200">
          <div class="text-lg font-semibold">Nivelación UAI</div>
          <div class="text-sm text-slate-600">Sistema de Nivelación</div>
        </div>

        <div class="p-6 space-y-4">
          <form class="space-y-3" [formGroup]="form" (ngSubmit)="submit()">
            <label class="block">
              <span class="block text-xs font-semibold text-slate-700 mb-1">Usuario</span>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                formControlName="usuario"
                placeholder="Usuario"
                [readOnly]="loading"
              />
            </label>

            <label class="block">
              <span class="block text-xs font-semibold text-slate-700 mb-1">Password</span>
              <input
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                formControlName="password"
                placeholder="********"
                [readOnly]="loading"
              />
            </label>

            <div *ngIf="error" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {{ error }}
            </div>

            <button
              type="submit"
              class="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="form.invalid || loading"
            >
              <span *ngIf="loading" class="inline-flex items-center gap-2">
                <span
                  class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden="true"
                ></span>
                <span>Ingresando...</span>
              </span>
              <span *ngIf="!loading">Ingresar</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  error: string | null = null;

  form = this.fb.group({
    usuario: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  async submit() {
    if (this.loading || this.form.invalid) {
      return;
    }

    const usuario = String(this.form.value.usuario ?? '').trim();
    const password = String(this.form.value.password ?? '');

    this.loading = true;
    this.error = null;
    try {
      const res = await this.auth.login({ usuario, password });
      const targetUrl = isAdminBackofficeRole(res.user.role)
        ? '/admin/dashboard'
        : res.user.role === Role.DOCENTE
          ? '/teacher/schedule'
          : '/student/schedule';
      void this.router.navigateByUrl(targetUrl);
    } catch (e: any) {
      this.error = this.resolveLoginErrorMessage(e);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private resolveLoginErrorMessage(error: unknown): string {
    const apiMessage = this.extractApiMessage(error);

    if (error instanceof TimeoutError || (error as { name?: string } | null)?.name === 'TimeoutError') {
      return 'Tiempo de espera agotado.';
    }

    const status = (error as { status?: number } | null)?.status;
    if (status === 408) {
      return 'Tiempo de espera agotado.';
    }
    if (status === 401 || status === 403) {
      return apiMessage ?? 'Credenciales no validas.';
    }

    if (status === 0) {
      return 'No se pudo conectar con el servidor.';
    }

    if (typeof status === 'number' && status >= 500) {
      return apiMessage ?? 'Error del servidor.';
    }

    return apiMessage ?? 'No se pudo ingresar.';
  }

  private extractApiMessage(error: unknown): string | null {
    const candidate =
      (error as { error?: { mensaje?: unknown; message?: unknown } } | null)?.error?.mensaje ??
      (error as { error?: { mensaje?: unknown; message?: unknown } } | null)?.error?.message ??
      (error as { mensaje?: unknown; message?: unknown } | null)?.mensaje ??
      (error as { mensaje?: unknown; message?: unknown } | null)?.message;

    if (typeof candidate !== 'string') {
      return null;
    }

    const normalized = candidate.trim();
    return normalized ? normalized : null;
  }
}
