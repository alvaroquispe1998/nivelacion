import { AsyncPipe, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Role } from '@uai/shared';
import { AuthService } from '../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgIf, AsyncPipe],
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
            </div>
          </div>

          <nav class="flex items-center gap-2" *ngIf="(auth.user$ | async) as u">
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
  private readonly router = inject(Router);

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
