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
import {
  AdminPeriodContextService,
} from '../core/workflow/admin-period-context.service';
import { WorkflowStateService } from '../core/workflow/workflow-state.service';
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

interface StudentPlatformItem {
  id: string;
  title: string;
  url: string;
  username?: string;
  password?: string;
  iconPath?: string;
  customIconUrl?: string;
  copyPasswordOnly?: boolean;
  showExplicitPassword?: boolean;
  isActionBtn?: boolean;
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
                <ng-container *ngIf="u.role === Role.ALUMNO; else docenteAulaVirtualLink">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    (click)="openPlatformsModal()"
                  >
                    <svg class="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 5.25h16.5M3.75 12h16.5M3.75 18.75h16.5" />
                    </svg>
                    Plataformas
                  </button>
                </ng-container>
                <ng-template #docenteAulaVirtualLink>
                  <a
                    *ngIf="u.role === Role.DOCENTE"
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
                </ng-template>

                <div class="h-5 w-px bg-slate-200 mx-1"></div>

                <!-- ALUMNO links -->
                <ng-container *ngIf="u.role === Role.ALUMNO">
                  <a
                    routerLink="/student/schedule"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v2.25m7.5-2.25v2.25M3.75 8.25h16.5M4.5 6h15A1.5 1.5 0 0121 7.5v11.25a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.75V7.5A1.5 1.5 0 014.5 6z" />
                    </svg>
                    Horario
                  </a>
                  <a
                    routerLink="/student/attendance"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75l2.25 2.25L15 9.75m6 2.25a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Asistencia
                  </a>
                </ng-container>

                <!-- DOCENTE links -->
                <ng-container *ngIf="u.role === Role.DOCENTE">
                  <a
                    routerLink="/teacher/schedule"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v2.25m7.5-2.25v2.25M3.75 8.25h16.5M4.5 6h15A1.5 1.5 0 0121 7.5v11.25a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.75V7.5A1.5 1.5 0 014.5 6z" />
                    </svg>
                    Mi Horario
                  </a>
                  <a
                    routerLink="/teacher/attendance"
                    routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                    class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2M3.75 12a8.25 8.25 0 1116.5 0 8.25 8.25 0 01-16.5 0z" />
                    </svg>
                    Registrar Asistencia
                  </a>
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

          <!-- Plataformas (solo alumno) -->
          <div
            *ngIf="u.role === Role.ALUMNO && platformsModalOpen"
            class="fixed inset-0 z-50 bg-slate-900/50 p-4 backdrop-blur-sm"
            (click)="closePlatformsModal()"
          >
            <div
              class="mx-auto mt-8 max-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
              (click)="$event.stopPropagation()"
            >
              <div class="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <h2 class="text-xl font-bold text-slate-900">Accesos a Plataformas</h2>
                  <p class="text-sm text-slate-600">
                    Consulta usuarios, claves y enlaces de acceso para tus plataformas institucionales.
                  </p>
                </div>
                <button
                  type="button"
                  class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  (click)="closePlatformsModal()"
                >
                  Cerrar
                </button>
              </div>

              <div class="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
                <article
                  *ngFor="let platform of studentPlatforms(u)"
                  class="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div class="flex items-center gap-3">
                    <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700">
                      <img *ngIf="platform.customIconUrl" [src]="platform.customIconUrl" class="h-6 object-contain" [alt]="platform.title" />
                      <svg *ngIf="!platform.customIconUrl && platform.iconPath" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="platform.iconPath" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold leading-tight text-slate-900">{{ platform.title }}</h3>
                    </div>
                  </div>

                  <div class="mt-4 flex-1">
                    <div *ngIf="platform.username" class="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm flex justify-between items-center">
                      <div>
                        <span class="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Usuario
                        </span>
                        <span class="mt-0.5 block font-medium text-slate-900">
                          {{ platform.username }}
                        </span>
                      </div>
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="Copiar usuario"
                        (click)="copyToClipboard(platform.username, platform.id + '-user')"
                      >
                         <svg *ngIf="copiedKey !== platform.id + '-user'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                         </svg>
                         <svg *ngIf="copiedKey === platform.id + '-user'" class="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                         </svg>
                      </button>
                    </div>

                    <ng-container *ngIf="platform.password">
                      <!-- Explicit View -->
                      <div *ngIf="platform.showExplicitPassword" class="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm flex justify-between items-center">
                        <div>
                          <span class="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Contraseña
                          </span>
                          <span class="mt-0.5 block font-medium text-slate-900">
                            {{ platform.password }}
                          </span>
                        </div>
                        <button
                          type="button"
                          class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="Copiar contraseña"
                          (click)="copyToClipboard(platform.password, platform.id + '-pass')"
                        >
                           <svg *ngIf="copiedKey !== platform.id + '-pass'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                           </svg>
                           <svg *ngIf="copiedKey === platform.id + '-pass'" class="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                           </svg>
                        </button>
                      </div>

                      <!-- Button Only View -->
                      <button
                        *ngIf="!platform.showExplicitPassword"
                        type="button"
                        class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        title="Copiar contraseña"
                        (click)="copyToClipboard(platform.password, platform.id + '-pass')"
                      >
                        <svg *ngIf="copiedKey !== platform.id + '-pass'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <svg *ngIf="copiedKey === platform.id + '-pass'" class="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span *ngIf="copiedKey === platform.id + '-pass'" class="text-emerald-700">Copiada</span>
                        <span *ngIf="copiedKey !== platform.id + '-pass'">Copiar Contraseña</span>
                      </button>
                    </ng-container>
                  </div>

                  <!-- Actions -->
                  <button
                    *ngIf="platform.isActionBtn"
                    type="button"
                    (click)="switchToResourcesModal()"
                    class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Ver base de datos
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </button>

                  <a
                    *ngIf="!platform.isActionBtn"
                    [href]="platform.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                  >
                    Ingresar
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </a>
                </article>
              </div>
            </div>
          </div>
          
          <!-- Recursos Académicos (solo alumno) -->
          <div
            *ngIf="u.role === Role.ALUMNO && resourcesModalOpen"
            class="fixed inset-0 z-50 bg-slate-900/50 p-4 backdrop-blur-sm"
            (click)="closeAllModals()"
          >
            <div
              class="mx-auto mt-8 max-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
              (click)="$event.stopPropagation()"
            >
              <div class="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <h2 class="text-xl font-bold text-slate-900">Bases de Datos y Recursos</h2>
                  <p class="text-sm text-slate-600">
                    Consulta credenciales y enlaces para recursos acádemicos de la institución.
                  </p>
                </div>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    (click)="switchToPlatformsModal()"
                  >
                    <svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Volver
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-200 border-transparent bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                    (click)="closeAllModals()"
                  >
                    Cerrar Todo
                  </button>
                </div>
              </div>

              <div class="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
                <article
                  *ngFor="let platform of resourcePlatforms()"
                  class="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div class="flex items-center gap-3">
                    <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700">
                      <img *ngIf="platform.customIconUrl" [src]="platform.customIconUrl" class="h-6 object-contain" [alt]="platform.title" />
                      <svg *ngIf="!platform.customIconUrl && platform.iconPath" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="platform.iconPath" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold leading-tight text-slate-900">{{ platform.title }}</h3>
                    </div>
                  </div>

                  <div class="mt-4 flex-1">
                    <div *ngIf="platform.username" class="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm flex justify-between items-center">
                      <div>
                        <span class="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Usuario
                        </span>
                        <span class="mt-0.5 block font-medium text-slate-900">
                          {{ platform.username }}
                        </span>
                      </div>
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="Copiar usuario"
                        (click)="copyToClipboard(platform.username, platform.id + '-user')"
                      >
                         <svg *ngIf="copiedKey !== platform.id + '-user'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                         </svg>
                         <svg *ngIf="copiedKey === platform.id + '-user'" class="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                         </svg>
                      </button>
                    </div>

                    <ng-container *ngIf="platform.password">
                      <!-- Explicit View -->
                      <div *ngIf="platform.showExplicitPassword" class="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm flex justify-between items-center">
                        <div>
                          <span class="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Contraseña
                          </span>
                          <span class="mt-0.5 block font-medium text-slate-900">
                            {{ platform.password }}
                          </span>
                        </div>
                        <button
                          type="button"
                          class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="Copiar contraseña"
                          (click)="copyToClipboard(platform.password, platform.id + '-pass')"
                        >
                           <svg *ngIf="copiedKey !== platform.id + '-pass'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                           </svg>
                           <svg *ngIf="copiedKey === platform.id + '-pass'" class="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                           </svg>
                        </button>
                      </div>

                      <!-- Button Only View -->
                      <button
                        *ngIf="!platform.showExplicitPassword"
                        type="button"
                        class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        title="Copiar contraseña"
                        (click)="copyToClipboard(platform.password, platform.id + '-pass')"
                      >
                        <svg *ngIf="copiedKey !== platform.id + '-pass'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <svg *ngIf="copiedKey === platform.id + '-pass'" class="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span *ngIf="copiedKey === platform.id + '-pass'" class="text-emerald-700">Copiada</span>
                        <span *ngIf="copiedKey !== platform.id + '-pass'">Copiar Contraseña</span>
                      </button>
                    </ng-container>
                  </div>

                  <!-- Actions -->
                  <button
                    *ngIf="platform.isActionBtn"
                    type="button"
                    (click)="switchToResourcesModal()"
                    class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Ver base de datos
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </button>

                  <a
                    *ngIf="!platform.isActionBtn"
                    [href]="platform.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                  >
                    Ingresar
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </a>
                </article>
              </div>
            </div>
          </div>
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
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private readonly workflowState = inject(WorkflowStateService);

  // ── Period state ───────────────────────────────────────────────────────────
  periods: PeriodView[] = [];
  activePeriod: PeriodView | null = null;
  selectedPeriodId = '';
  switchingPeriod = false;
  loadingPeriod = true;

  // ── Layout state ──────────────────────────────────────────────────────────
  sidebarCollapsed = false;
  platformsModalOpen = false;
  resourcesModalOpen = false;
  copiedKey: string | null = null;

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
    if (!nextId || nextId === this.selectedPeriodId || this.switchingPeriod) return;
    const selected = this.periods.find((p) => p.id === nextId) ?? null;
    if (!selected) return;

    this.selectedPeriodId = selected.id;
    this.activePeriod = selected;
    this.adminPeriodContext.setSelectedPeriod({
      id: selected.id,
      code: selected.code,
      name: selected.name,
      startsAt: selected.startsAt ?? null,
      endsAt: selected.endsAt ?? null,
    });
    this.workflowState.notifyWorkflowChanged();
    this.cdr.detectChanges();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  openPlatformsModal() {
    this.copiedKey = null;
    this.platformsModalOpen = true;
  }

  closePlatformsModal() {
    this.platformsModalOpen = false;
    this.copiedKey = null;
  }

  switchToResourcesModal() {
    this.copiedKey = null;
    this.platformsModalOpen = false;
    this.resourcesModalOpen = true;
  }

  switchToPlatformsModal() {
    this.copiedKey = null;
    this.resourcesModalOpen = false;
    this.platformsModalOpen = true;
  }

  closeAllModals() {
    this.resourcesModalOpen = false;
    this.platformsModalOpen = false;
    this.copiedKey = null;
  }

  studentPlatforms(user: AuthUser): StudentPlatformItem[] {
    const studentCode = this.safeValue(user.codigoAlumno, 'codigo estudiante');
    const email = this.safeValue(user.email, 'correo institucional');
    const dni = this.safeValue(user.dni, 'DNI');
    const institutionalPassword = this.buildInstitutionalPassword(user);

    const iconComputer = 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25';
    const iconMail = 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.909A2.25 2.25 0 012.25 6.993V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25';
    const iconBook = 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25';

    return [
      {
        id: 'aula-virtual',
        title: 'Aula Virtual',
        url: 'https://aulavirtual2.autonomadeica.edu.pe/',
        username: studentCode,
        password: dni,
        iconPath: iconComputer,
      },
      {
        id: 'campus-virtual',
        title: 'Campus Virtual',
        url: 'https://campusvirtual.autonomadeica.edu.pe/',
        username: studentCode,
        password: dni,
        iconPath: iconComputer,
      },
      {
        id: 'correo-institucional',
        title: 'Correo Institucional',
        url: 'https://outlook.office365.com/mail',
        username: email,
        password: institutionalPassword,
        iconPath: iconMail,
      },
      {
        id: 'biblioteca-virtual',
        title: 'Biblioteca Virtual',
        url: 'https://elibro.net/es/lc/autonomadeica/login_usuario/?next=/es/lc/autonomadeica',
        username: email,
        password: institutionalPassword,
        iconPath: iconBook,
      },
      {
        id: 'bases-de-datos',
        title: 'Bases de Datos',
        url: '',
        username: 'invitado',
        password: 'invitado',
        iconPath: iconBook,
        isActionBtn: true,
        showExplicitPassword: true
      }
    ];
  }

  resourcePlatforms(): StudentPlatformItem[] {
    const iconLibrary = 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25';

    return [
      {
        id: 'ebsco',
        title: 'EBSCO',
        url: 'https://aulavirtual.autonomadeica.edu.pe/course/view.php?id=7597',
        username: 'invitado',
        password: 'invitado',
        iconPath: iconLibrary,
        showExplicitPassword: true
      },
      {
        id: 'proquest',
        title: 'ProQuest',
        url: 'https://aulavirtual.autonomadeica.edu.pe/course/view.php?id=7598',
        username: 'invitado',
        password: 'invitado',
        iconPath: iconLibrary,
        showExplicitPassword: true
      },
      {
        id: 'palestra',
        title: 'Palestra',
        url: 'https://aulavirtual.autonomadeica.edu.pe/course/view.php?id=7825',
        username: 'invitado',
        password: 'invitado',
        iconPath: iconLibrary,
        showExplicitPassword: true
      },
    ];
  }

  async copyToClipboard(value: string, key: string) {
    const text = String(value ?? '').trim();
    if (!text) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this.copyWithExecCommand(text);
      }
    } catch {
      this.copyWithExecCommand(text);
    }

    this.copiedKey = key;
    setTimeout(() => {
      if (this.copiedKey === key) this.copiedKey = null;
    }, 1500);
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
  private safeValue(value: string | null | undefined, fallback: string): string {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }


  private buildInstitutionalPassword(user: AuthUser): string {
    const dni = this.safeValue(user.dni, 'DNI');
    if (dni === 'DNI') return 'Iniciales + DNI';

    const paternalSeed = String(user.paternalLastName ?? '').trim();
    const namesSeed = String(user.names ?? '').trim();

    const paternalInitial =
      (paternalSeed || String(user.fullName ?? '').trim()).charAt(0).toUpperCase() || 'X';

    const firstNameChunk =
      (namesSeed.split(/\s+/).find((part) => part.trim().length > 0) ||
        String(user.fullName ?? '').trim().split(/\s+/).find((part) => part.trim().length > 0) ||
        '')
        .charAt(0)
        .toLowerCase() || 'x';

    return `${paternalInitial}${firstNameChunk}${dni}`;
  }

  private copyWithExecCommand(text: string) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  private async loadPeriodContext() {
    if (!this.auth.user) return;
    try {
      if (this.auth.user!.role === Role.ADMIN) {
        const rows = await firstValueFrom(
          this.http.get<PeriodView[]>('/api/admin/periods')
        );
        this.periods = rows;
        const selected = this.adminPeriodContext.resolveFromPeriodList(rows);
        const selectedRow = selected
          ? rows.find((x) => x.id === selected.id) ?? null
          : null;
        this.activePeriod = selectedRow;
        this.selectedPeriodId = selected?.id ?? '';
        this.workflowState.notifyWorkflowChanged();
      } else {
        this.activePeriod = await firstValueFrom(
          this.http.get<PeriodView>('/api/periods/active')
        );
        this.selectedPeriodId = this.activePeriod!.id;
        this.periods = this.activePeriod ? [this.activePeriod] : [];
      }
    } catch {
      this.activePeriod = null;
      this.periods = [];
      this.selectedPeriodId = '';
      this.adminPeriodContext.setSelectedPeriod(null);
    } finally {
      this.loadingPeriod = false;
      this.cdr.detectChanges();
    }
  }
}

