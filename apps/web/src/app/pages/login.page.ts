import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Role } from '@uai/shared';
import { AuthService } from '../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="p-6 border-b border-slate-200">
          <div class="text-lg font-semibold">Ingreso</div>
          <div class="text-sm text-slate-600">UAI | Horario y Asistencia</div>
        </div>

        <div class="p-6 space-y-4">
          <form class="space-y-3" [formGroup]="form" (ngSubmit)="submit()">
            <label class="block">
              <span class="block text-xs font-semibold text-slate-700 mb-1">Usuario</span>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                formControlName="usuario"
                placeholder="Codigo de alumno, DNI o administrador"
              />
            </label>

            <label class="block">
              <span class="block text-xs font-semibold text-slate-700 mb-1">Password</span>
              <input
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                formControlName="password"
                placeholder="********"
              />
            </label>

            <div *ngIf="error" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {{ error }}
            </div>

            <button
              class="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="form.invalid || loading"
            >
              {{ loading ? 'Ingresando...' : 'Ingresar' }}
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

  loading = false;
  error: string | null = null;

  form = this.fb.group({
    usuario: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  async submit() {
    this.loading = true;
    this.error = null;
    try {
      const usuario = String(this.form.value.usuario ?? '').trim();
      const password = String(this.form.value.password ?? '');
      const res = await this.auth.login({ usuario, password });
      await this.router.navigateByUrl(
        res.user.role === Role.ADMIN
          ? '/admin/sections'
          : res.user.role === Role.DOCENTE
            ? '/teacher/schedule'
            : '/student/schedule'
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo ingresar';
    } finally {
      this.loading = false;
    }
  }
}
