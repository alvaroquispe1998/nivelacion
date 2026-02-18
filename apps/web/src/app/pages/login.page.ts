import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Role } from '@uai/shared';
import { AuthService } from '../core/auth/auth.service';

type LoginMode = 'ALUMNO' | 'STAFF';

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
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-xl px-3 py-2 text-sm font-semibold border"
              [class.bg-slate-900]="mode==='ALUMNO'"
              [class.text-white]="mode==='ALUMNO'"
              [class.border-slate-900]="mode==='ALUMNO'"
              [class.bg-white]="mode!=='ALUMNO'"
              [class.text-slate-900]="mode!=='ALUMNO'"
              [class.border-slate-200]="mode!=='ALUMNO'"
              (click)="setMode('ALUMNO')"
            >
              Alumno
            </button>
            <button
              type="button"
              class="rounded-xl px-3 py-2 text-sm font-semibold border"
              [class.bg-slate-900]="mode==='STAFF'"
              [class.text-white]="mode==='STAFF'"
              [class.border-slate-900]="mode==='STAFF'"
              [class.bg-white]="mode!=='STAFF'"
              [class.text-slate-900]="mode!=='STAFF'"
              [class.border-slate-200]="mode!=='STAFF'"
              (click)="setMode('STAFF')"
            >
              Personal
            </button>
          </div>

          <form class="space-y-3" [formGroup]="form" (ngSubmit)="submit()">
            <label class="block">
              <span class="block text-xs font-semibold text-slate-700 mb-1">DNI</span>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                formControlName="dni"
                placeholder="Ej: 12345678"
              />
            </label>

            <label class="block" *ngIf="mode==='ALUMNO'">
              <span class="block text-xs font-semibold text-slate-700 mb-1">Codigo Alumno</span>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                formControlName="codigoAlumno"
                placeholder="Ej: A001"
              />
            </label>

            <label class="block" *ngIf="mode==='STAFF'">
              <span class="block text-xs font-semibold text-slate-700 mb-1">Password</span>
              <input
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                formControlName="password"
                placeholder="••••••••"
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

          <div class="text-xs text-slate-600">
            Demo:
            <div class="mt-1">
              Admin: DNI <code>{{ demoAdminDni }}</code> / password <code>{{ demoAdminPass }}</code>
            </div>
            <div>
              Alumno: DNI <code>10000001</code> / codigo <code>A001</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  mode: LoginMode = 'ALUMNO';
  loading = false;
  error: string | null = null;

  // must match .env.example seed defaults
  demoAdminDni = '00000000';
  demoAdminPass = 'admin123';

  form = this.fb.group({
    dni: ['', [Validators.required]],
    codigoAlumno: [''],
    password: [''],
  });

  setMode(mode: LoginMode) {
    this.mode = mode;
    this.error = null;
    this.form.patchValue({ codigoAlumno: '', password: '' });
    if (mode === 'ALUMNO') {
      this.form.get('codigoAlumno')?.setValidators([Validators.required]);
      this.form.get('password')?.clearValidators();
    } else {
      this.form.get('password')?.setValidators([Validators.required]);
      this.form.get('codigoAlumno')?.clearValidators();
    }
    this.form.get('codigoAlumno')?.updateValueAndValidity();
    this.form.get('password')?.updateValueAndValidity();
  }

  async submit() {
    this.loading = true;
    this.error = null;
    try {
      const dni = String(this.form.value.dni ?? '').trim();
      if (this.mode === 'ALUMNO') {
        const codigoAlumno = String(this.form.value.codigoAlumno ?? '').trim();
        const res = await this.auth.login({ dni, codigoAlumno });
        await this.router.navigateByUrl(
          res.user.role === Role.ADMIN
            ? '/admin/sections'
            : res.user.role === Role.DOCENTE
              ? '/teacher/schedule'
              : '/student/schedule'
        );
      } else {
        const password = String(this.form.value.password ?? '');
        const res = await this.auth.login({ dni, password });
        await this.router.navigateByUrl(
          res.user.role === Role.ADMIN
            ? '/admin/sections'
            : res.user.role === Role.DOCENTE
              ? '/teacher/schedule'
              : '/student/schedule'
        );
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo ingresar';
    } finally {
      this.loading = false;
    }
  }
}
