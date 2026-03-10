import { AsyncPipe, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIf, AsyncPipe],
  selector: 'app-support-shell',
  template: `
    <ng-container *ngIf="auth.user$ | async as user">
      <div class="min-h-dvh bg-slate-50 text-slate-900">
        <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-sm">
          <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white">
                UAI
              </div>
              <div class="leading-tight">
                <div class="text-sm font-semibold text-slate-900">Sistema Academico</div>
                <div class="text-[11px] text-slate-500">
                  {{ user.fullName }}
                  <span class="mx-1 text-slate-300">|</span>
                  <span class="font-medium text-slate-700">Soporte Tecnico</span>
                </div>
              </div>
            </div>

            <nav class="flex flex-wrap items-center justify-end gap-2">
              <a
                routerLink="/support/classroom-schedule"
                routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                [routerLinkActiveOptions]="{ exact: true }"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                Horario por aula
              </a>
              <a
                routerLink="/support/account/password"
                routerLinkActive="bg-blue-50 text-blue-700 font-semibold"
                [routerLinkActiveOptions]="{ exact: true }"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                Cambiar contraseña
              </a>
              <div class="mx-1 h-5 w-px bg-slate-200"></div>
              <button
                type="button"
                class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                (click)="logout()"
              >
                Salir
              </button>
            </nav>
          </div>
        </header>

        <main class="mx-auto max-w-5xl px-4 py-8">
          <router-outlet></router-outlet>
        </main>
      </div>
    </ng-container>
  `,
})
export class SupportShellComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
