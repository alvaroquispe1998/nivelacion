import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Role } from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';

interface PeriodView {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgIf, NgFor, AsyncPipe],
  selector: 'app-shell',
  template: `
    <div class="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-xl bg-slate-900 text-white grid place-items-center font-semibold">
              UAI
            </div>
            <div class="leading-tight">
              <div class="text-sm font-semibold">Horario y Asistencia</div>
              <div class="text-xs text-slate-600" *ngIf="(auth.user$ | async) as u">
                {{ u.fullName }} ({{ u.role }})
              </div>
              <div class="text-xs text-slate-500" *ngIf="activePeriod">
                Periodo activo: {{ activePeriod.code }} - {{ activePeriod.name }}
              </div>
            </div>
          </div>

          <nav class="flex items-center gap-2" *ngIf="(auth.user$ | async) as u">
            <label
              *ngIf="u.role === Role.ADMIN"
              class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
            >
              <span class="font-semibold">Periodo</span>
              <select
                class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none"
                [value]="selectedPeriodId"
                [disabled]="switchingPeriod || periods.length === 0"
                (change)="onPeriodSelected($any($event.target).value)"
              >
                <option *ngFor="let p of periods" [value]="p.id">
                  {{ p.code }} - {{ p.name }}{{ p.status === 'ACTIVE' ? ' (Activo)' : '' }}
                </option>
              </select>
            </label>
            <a
              *ngIf="u.role === Role.ALUMNO"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/student/schedule"
              >Horario</a
            >
            <a
              *ngIf="u.role === Role.ALUMNO"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/student/attendance"
              >Asistencia</a
            >
            <a
              *ngIf="u.role === Role.DOCENTE"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/teacher/schedule"
              >Mi Horario</a
            >
            <a
              *ngIf="u.role === Role.DOCENTE"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/teacher/attendance"
              >Registrar Asistencia</a
            >
            <a
              *ngIf="u.role === Role.ADMIN"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/admin/sections"
              >Secciones</a
            >
            <a
              *ngIf="u.role === Role.ADMIN"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/admin/leveling"
              >Nivelacion</a
            >
            <a
              *ngIf="u.role === Role.ADMIN"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/admin/teachers"
              >Docentes</a
            >
            <a
              *ngIf="u.role === Role.ADMIN"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/admin/periods"
              >Periodos</a
            >
            <a
              *ngIf="u.role === Role.ADMIN"
              class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
              routerLink="/admin/export"
              >Exportar</a
            >

            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
              (click)="logout()"
            >
              Salir
            </button>
          </nav>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-6">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly Role = Role;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  periods: PeriodView[] = [];
  activePeriod: PeriodView | null = null;
  selectedPeriodId = '';
  switchingPeriod = false;

  async ngOnInit() {
    await this.loadPeriodContext();
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  async onPeriodSelected(nextPeriodId: string) {
    const user = this.auth.user;
    if (!user || user.role !== Role.ADMIN) return;
    const nextId = String(nextPeriodId || '').trim();
    if (!nextId || nextId === this.selectedPeriodId || this.switchingPeriod) return;

    this.switchingPeriod = true;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/periods/${encodeURIComponent(nextId)}/activate`, {})
      );
      await this.loadPeriodContext();
      window.location.reload();
    } finally {
      this.switchingPeriod = false;
    }
  }

  private async loadPeriodContext() {
    if (!this.auth.user) return;
    try {
      this.activePeriod = await firstValueFrom(
        this.http.get<PeriodView>('/api/periods/active')
      );
      this.selectedPeriodId = this.activePeriod.id;

      if (this.auth.user.role === Role.ADMIN) {
        const rows = await firstValueFrom(
          this.http.get<PeriodView[]>('/api/admin/periods')
        );
        this.periods = rows;
        const active = rows.find((x) => x.status === 'ACTIVE');
        if (active) {
          this.selectedPeriodId = active.id;
        }
        return;
      }

      this.periods = this.activePeriod ? [this.activePeriod] : [];
    } catch {
      this.activePeriod = null;
      this.periods = [];
      this.selectedPeriodId = '';
    }
  }
}
