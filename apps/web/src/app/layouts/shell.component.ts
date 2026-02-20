import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Role } from '@uai/shared';
import type { AuthUser } from '@uai/shared';
import { firstValueFrom, Subscription } from 'rxjs';

import { AuthService } from '../core/auth/auth.service';
import { AdminSidebarComponent } from './admin-sidebar.component';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PeriodView {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    AsyncPipe,
    FormsModule,
    AdminSidebarComponent,
  ],
  selector: 'app-shell',

  // ─── Template ──────────────────────────────────────────────────────────────
  template: `
    <ng-container *ngIf="(auth.user$ | async) as u">

      <!-- ══════════════════════════════════════════════════════════════════════
           ADMIN LAYOUT — sidebar + minimalista header
      ══════════════════════════════════════════════════════════════════════════ -->
      <ng-container *ngIf="u.role === Role.ADMIN">
        <div class="flex h-screen overflow-hidden bg-slate-50">

          <!-- Sidebar -->
          <app-admin-sidebar
            [userName]="u.fullName"
            (collapsedChange)="sidebarCollapsed = $event"
          ></app-admin-sidebar>

          <!-- Main column -->
          <div class="flex flex-1 flex-col overflow-hidden">

            <!-- ── Topbar ─────────────────────────────────────────────────── -->
            <header
              class="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm"
            >
              <!-- Left: hamburger + breadcrumb period chip -->
              <div class="flex items-center gap-3">
                <!-- Hamburger toggle (mobile) -->
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors lg:hidden"
                  (click)="toggleSidebar()"
                  title="Menú"
                >
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>

                <!-- Periodo activo chip -->
                <div
                  *ngIf="activePeriod"
                  class="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {{ activePeriod.code }}: {{ activePeriod.name }}
                </div>

                <!-- No period warning -->
                <div
                  *ngIf="!activePeriod && !loadingPeriod"
                  class="hidden sm:flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                  Sin periodo activo
                </div>
              </div>

              <!-- Right: period selector + user + logout -->
              <div class="flex items-center gap-3">

                <!-- Period selector -->
                <label
                  *ngIf="periods.length > 0"
                  class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <span class="hidden sm:inline font-semibold text-slate-500">Periodo</span>
                  <select
                    class="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs outline-none focus:border-blue-400 transition-colors"
                    [ngModel]="selectedPeriodId"
                    [disabled]="switchingPeriod || periods.length === 0"
                    (ngModelChange)="onPeriodSelected($event)"
                  >
                    <option *ngFor="let p of periods" [value]="p.id">
                      {{ p.code }}{{ p.status === 'ACTIVE' ? ' ✓' : '' }}
                    </option>
                  </select>
                  <!-- Spinner while switching -->
                  <svg
                    *ngIf="switchingPeriod"
                    class="h-3.5 w-3.5 animate-spin text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                </label>

                <!-- User chip -->
                <div class="hidden md:flex items-center gap-2">
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-blue-100"
                  >
                    {{ initials(u.fullName) }}
                  </div>
                  <div class="leading-tight">
                    <div class="text-xs font-semibold text-slate-800">{{ u.fullName }}</div>
                    <div class="text-[11px] text-slate-500">Administrador</div>
                  </div>
                </div>

                <!-- Divider -->
                <div class="h-6 w-px bg-slate-200"></div>

                <!-- Logout -->
                <button
                  class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  (click)="logout()"
                >
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  <span class="hidden sm:inline">Salir</span>
                </button>
              </div>
            </header>

            <!-- ── Page content ────────────────────────────────────────────── -->
            <main class="flex-1 overflow-y-auto">
              <div class="mx-auto max-w-7xl px-4 py-8">
                <router-outlet></router-outlet>
              </div>
            </main>

          </div><!-- /main column -->
        </div><!-- /flex h-screen -->
      </ng-container>


      <!-- ══════════════════════════════════════════════════════════════════════
           NON-ADMIN LAYOUT — classic top nav (ALUMNO / DOCENTE unchanged)
      ══════════════════════════════════════════════════════════════════════════ -->
      <ng-container *ngIf="u.role !== Role.ADMIN">
        <div class="min-h-dvh bg-slate-50 text-slate-900">

          <!-- Top header -->
          <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm shadow-sm">
            <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">

              <!-- Brand -->
              <a routerLink="/" class="flex items-center gap-2">
                <div class="h-9 w-9 rounded-xl bg-slate-900 text-white grid place-items-center font-bold text-sm select-none">
                  UAI
                </div>
                <div class="hidden sm:block leading-tight">
                  <div class="text-sm font-semibold text-slate-900">Sistema Académico</div>
                  <div class="text-[11px] text-slate-500">
                    {{ u.fullName }}
                    <span class="mx-1 text-slate-300">·</span>
                    <span class="font-medium text-slate-700">{{ roleLabel(u.role) }}</span>
                  </div>
                </div>
              </a>

              <!-- Nav -->
              <nav class="flex items-center gap-1">
                <a
                  href="https://aulavirtual2.autonomadeica.edu.pe/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 6.75h15m-15 5.25h15m-15 5.25h9" />
                  </svg>
                  Aula Virtual
                </a>

                <div class="h-5 w-px bg-slate-200 mx-1"></div>

                <!-- ALUMNO links -->
                <ng-container *ngIf="u.role === Role.ALUMNO">
                  <a
                    routerLink="/student/schedule"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >🗓 Horario</a>
                  <a
                    routerLink="/student/attendance"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >✅ Asistencia</a>
                </ng-container>

                <!-- DOCENTE links -->
                <ng-container *ngIf="u.role === Role.DOCENTE">
                  <a
                    routerLink="/teacher/schedule"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >🗓 Mi Horario</a>
                  <a
                    routerLink="/teacher/attendance"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >📝 Registrar Asistencia</a>
                </ng-container>

                <div class="h-5 w-px bg-slate-200 mx-1"></div>

                <!-- Logout -->
                <button
                  class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  (click)="logout()"
                >
                  Salir
                </button>
              </nav>
            </div>
          </header>

          <!-- Page content -->
          <main class="mx-auto max-w-5xl px-4 py-8">
            <router-outlet></router-outlet>
          </main>
        </div>
      </ng-container>

    </ng-container>
  `,

  styles: [`
    :host { display: contents; }
  `],
})
export class ShellComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly Role = Role;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  // ── Period state ───────────────────────────────────────────────────────────
  periods: PeriodView[] = [];
  activePeriod: PeriodView | null = null;
  selectedPeriodId = '';
  switchingPeriod = false;
  loadingPeriod = true;

  // ── Layout state ──────────────────────────────────────────────────────────
  sidebarCollapsed = false;

  private userSub?: Subscription;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit() {
    this.userSub = this.auth.user$.subscribe(async (user: AuthUser | null) => {
      this.activePeriod = null;
      this.selectedPeriodId = '';
      this.periods = [];
      this.loadingPeriod = true;
      this.cdr.detectChanges();

      if (user) {
        await this.loadPeriodContext();
      }
    });
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────

  /** Called from the hamburger button on mobile */
  toggleSidebar() {
    // The sidebar manages its own collapsed state; we reach it via the
    // template reference, but toggling through the emitted event is simpler.
    // We dispatch a synthetic click by toggling sidebarCollapsed here and
    // letting the sidebar pick it back up. For mobile we just flip the flag.
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  // ── Period switching ──────────────────────────────────────────────────────

  async onPeriodSelected(nextPeriodId: string) {
    const user = this.auth.user;
    if (!user || user.role !== Role.ADMIN) return;
    const nextId = String(nextPeriodId || '').trim();
    // Guard against same period or concurrent switch.
    // NOTE: do NOT compare against this.selectedPeriodId here — with one-way
    // [ngModel] binding it is only updated after the API call succeeds.
    if (!nextId || nextId === this.activePeriod?.id || this.switchingPeriod) return;

    this.switchingPeriod = true;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/periods/${encodeURIComponent(nextId)}/activate`, {})
      );
      await this.loadPeriodContext();
      window.location.reload();
    } finally {
      this.switchingPeriod = false;
      this.cdr.detectChanges();
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Two-letter initials from a full name */
  initials(full: string): string {
    return full
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase();
  }

  roleLabel(role: string): string {
    const labels: Record<string, string> = {
      ADMIN: 'Administrador',
      ALUMNO: 'Alumno',
      DOCENTE: 'Docente',
    };
    return labels[role] ?? role;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async loadPeriodContext() {
    if (!this.auth.user) return;
    try {
      this.activePeriod = await firstValueFrom(
        this.http.get<PeriodView>('/api/periods/active')
      );
      this.selectedPeriodId = this.activePeriod!.id;

      if (this.auth.user!.role === Role.ADMIN) {
        const rows = await firstValueFrom(
          this.http.get<PeriodView[]>('/api/admin/periods')
        );
        this.periods = rows;
        const active = rows.find((x: PeriodView) => x.status === 'ACTIVE');
        if (active) {
          this.selectedPeriodId = active.id;
        }
      } else {
        this.periods = this.activePeriod ? [this.activePeriod] : [];
      }
    } catch {
      this.activePeriod = null;
      this.periods = [];
      this.selectedPeriodId = '';
    } finally {
      this.loadingPeriod = false;
      this.cdr.detectChanges();
    }
  }
}
