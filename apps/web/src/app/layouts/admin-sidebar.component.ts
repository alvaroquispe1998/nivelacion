import { HttpClient } from '@angular/common/http';
import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, skip, Subscription } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import { WorkflowStateService } from '../core/workflow/workflow-state.service';

// ─── Menu model ───────────────────────────────────────────────────────────────

export type BadgeTone = 'emerald' | 'amber' | 'slate' | 'rose' | 'sky';

export interface SidebarItem {
  label: string;
  route: string;
  icon: string;        // SVG path data (Heroicons outline, 24×24)
  tooltip: string;
  badge?: string;      // e.g. "Nuevo", "3"
  badgeTone?: BadgeTone;
  queryParams?: Record<string, any>;
  disabled?: boolean;
}

export interface SidebarGroup {
  label: string;       // Section label shown when expanded
  step?: number;       // Optional numeric step badge
  items: SidebarItem[];
}

// ─── Heroicons outline paths (24×24 viewBox) ─────────────────────────────────

const ICON = {
  home: `M2.25 12L11.204 3.045c.44-.439 1.152-.439 1.591
         0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125
         1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621
         0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504
         1.125-1.125V9.75M8.25 21h7.5`,

  calendar: `M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0
             012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18
             0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021
             18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25
             2.25 0 0121 11.25v7.5`,

  chart: `M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0
          1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375
          21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125
          1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0
          .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5
          4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504
          21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125
          0 01-1.125-1.125V4.125z`,

  clock: `M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z`,

  academic: `M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627
             48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46
             60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0
             00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0
             0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482
             0A50.697 50.697 0 0112 13.489a50.702 50.702 0
             017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0
             000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007
             11.55A5.981 5.981 0 006.75 15.75v-1.5`,

  users: `M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0
          004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15
          19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375
          6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75
          0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25
          0 2.625 2.625 0 015.25 0z`,

  arrowUp: `M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0
            0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5`,

  chevronLeft: `M15.75 19.5L8.25 12l7.5-7.5`,
  chevronRight: `M8.25 4.5l7.5 7.5-7.5 7.5`,
};

// ─── Menu groups ─────────────────────────────────────────────────────────────

export const ADMIN_SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'Principal',
    items: [
      {
        label: 'Dashboard',
        route: '/admin/dashboard',
        icon: ICON.home,
        tooltip: 'Dashboard',
      },
    ],
  },
  {
    label: 'Preparación',
    step: 1,
    items: [
      {
        label: 'Periodos',
        route: '/admin/periods',
        icon: ICON.calendar,
        tooltip: 'Periodos',
      },
      {
        label: 'Nivelación',
        route: '/admin/leveling',
        icon: ICON.chart,
        tooltip: 'Nivelación',
      },
      {
        label: 'Docentes',
        route: '/admin/teachers',
        icon: ICON.users,
        tooltip: 'Gestión de docentes',
      },
      {
        label: 'Pabellon y Aulas',
        route: '/admin/classrooms',
        icon: ICON.home,
        tooltip: 'Pabellón y Aulas',
      },
    ],
  },
  {
    label: 'Programación',
    step: 2,
    items: [
      {
        label: 'Horarios y Docentes',
        route: '/admin/sections',
        queryParams: { view: 'schedule' },
        icon: ICON.clock,
        tooltip: 'Horarios y Docentes',
      },
    ],
  },
  {
    label: 'Matrícula',
    step: 3,
    items: [
      {
        label: 'Matrícula',
        route: '/admin/matricula',
        icon: ICON.academic,
        tooltip: 'Matrícula',
      },
      {
        label: 'Alumnos por Sección',
        route: '/admin/sections',
        queryParams: { view: 'students' },
        icon: ICON.users,
        tooltip: 'Alumnos por Sección',
      },
    ],
  },
  {
    label: 'Reportes',
    step: 4,
    items: [
      {
        label: 'Inteligencia / Base',
        route: '/admin/reports/program',
        icon: ICON.academic,
        tooltip: 'Mapeo Académico y Necesidades Generales',
      },
      {
        label: 'Visión Ejecutiva',
        route: '/admin/reports/summary',
        icon: ICON.clock,
        tooltip: 'Panorámica por Facultades',
      },
      {
        label: 'Exportar',
        route: '/admin/export',
        icon: ICON.arrowUp,
        tooltip: 'Exportar resultados',
      },
    ],
  },
];

const STORAGE_KEY = 'uai.sidebar.collapsed';

// Badge tone → Tailwind classes
const BADGE_CLASSES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100   text-amber-700',
  slate: 'bg-slate-100   text-slate-600',
  rose: 'bg-rose-100    text-rose-700',
  sky: 'bg-sky-100     text-sky-700',
};

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, RouterLink, RouterLinkActive],

  // ─── Template ──────────────────────────────────────────────────────────────
  template: `
    <!-- ── Mobile overlay ─────────────────────────────────────────────────── -->
    <div
      *ngIf="!collapsed && isMobile"
      class="fixed inset-0 z-20 bg-black/20 backdrop-blur-[2px] lg:hidden"
      (click)="collapse()"
    ></div>

    <!-- ── Sidebar panel ───────────────────────────────────────────────────── -->
    <aside
      [ngClass]="collapsed ? 'w-20' : 'w-72'"
      class="
        relative z-30 flex h-screen flex-col flex-shrink-0
        bg-white border-r border-slate-200 shadow-sm
        transition-all duration-200 ease-in-out
        overflow-hidden
      "
    >

      <!-- ── Header: logo + brand ────────────────────────────────────────── -->
      <div
        class="flex h-16 flex-shrink-0 items-center border-b border-slate-100 px-3"
        [ngClass]="collapsed ? 'justify-center' : 'justify-between px-4'"
      >
        <!-- Logo mark + text -->
        <div class="flex items-center gap-3 min-w-0">
          <!-- Logo mark -->
          <div
            class="
              flex h-9 w-9 flex-shrink-0 items-center justify-center
              rounded-xl bg-emerald-600 text-[11px] font-extrabold
              text-white tracking-widest shadow-sm select-none
            "
          >
            UAI
          </div>

          <!-- Brand text (hidden when collapsed) -->
          <div
            *ngIf="!collapsed"
            class="min-w-0 leading-tight"
          >
            <div class="truncate text-sm font-semibold text-slate-900">
              Sistema Académico
            </div>
            <div class="truncate text-[11px] text-slate-400 font-medium">
              Administración
            </div>
          </div>
        </div>

        <!-- Collapse button (expanded, desktop only) -->
        <button
          *ngIf="!collapsed"
          (click)="collapse()"
          title="Colapsar menú"
          class="
            hidden lg:flex h-7 w-7 flex-shrink-0 items-center justify-center
            rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700
            transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-200
          "
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="chevronLeft" />
          </svg>
        </button>
      </div>
      <!-- /Header -->

      <!-- ── Navigation ──────────────────────────────────────────────────── -->
      <nav class="flex-1 overflow-y-auto overflow-x-hidden py-3 sidebar-scroll">

        <ng-container *ngFor="let group of groups; let gFirst = first; let gLast = last">

          <!-- ── Group divider (collapsed mode: thin line between groups) ── -->
          <div
            *ngIf="collapsed && !gFirst"
            class="mx-4 my-2 border-t border-slate-100"
          ></div>

          <!-- ── Group label (expanded mode) ───────────────────────────── -->
          <div
            *ngIf="!collapsed"
            class="flex items-center gap-2 px-4 mt-5 mb-1.5 first:mt-2"
          >
            <!-- Step badge -->
            <span
              *ngIf="group.step"
              class="
                flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center
                rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-600
              "
            >
              {{ group.step }}
            </span>

            <!-- Label -->
            <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">
              {{ group.label }}
            </span>
          </div>
          <!-- /Group label -->

          <!-- ── Menu items ────────────────────────────────────────────── -->
          <ng-container *ngFor="let item of group.items">

            <!-- DISABLED item -->
            <span
              *ngIf="item.disabled"
              class="
                relative flex items-center gap-3 rounded-xl mx-2 mb-0.5
                h-10 px-3 opacity-40 cursor-not-allowed select-none
                text-slate-500 text-sm font-medium
              "
              [ngClass]="collapsed ? 'justify-center px-0' : ''"
              [title]="collapsed ? item.tooltip : ''"
            >
              <svg
                class="h-5 w-5 flex-shrink-0 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.icon" />
              </svg>
              <span *ngIf="!collapsed" class="truncate">{{ item.label }}</span>
            </span>

            <!-- ACTIVE / NORMAL item -->
            <a
              *ngIf="!item.disabled"
              [routerLink]="item.route"
              [queryParams]="item.queryParams"
              routerLinkActive="is-active"
              #rla="routerLinkActive"
              [title]="collapsed ? item.tooltip : ''"
              class="
                relative flex items-center gap-3 rounded-xl mx-2 mb-0.5
                h-10 px-3 text-sm font-medium
                transition-colors duration-150 ease-in-out
                focus:outline-none focus:ring-2 focus:ring-emerald-200
              "
              [ngClass]="[
                collapsed ? 'justify-center' : '',
                rla.isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              ]"
            >
              <!-- Active left-border indicator -->
              <span
                *ngIf="rla.isActive"
                class="
                  absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2
                  rounded-full bg-emerald-500
                "
              ></span>

              <!-- Icon -->
              <svg
                class="h-5 w-5 flex-shrink-0 transition-colors"
                [ngClass]="rla.isActive ? 'text-emerald-600' : 'text-slate-400'"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.icon" />
              </svg>

              <!-- Label + badge (only when expanded) -->
              <ng-container *ngIf="!collapsed">
                <span class="flex-1 truncate">{{ item.label }}</span>

                <!-- Optional badge pill -->
                <span
                  *ngIf="item.badge"
                  class="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
                  [ngClass]="badgeClass(item.badgeTone)"
                >
                  {{ item.badge }}
                </span>
              </ng-container>
            </a>
            <!-- /item -->

          </ng-container>
          <!-- /items -->

        </ng-container>
        <!-- /groups -->

      </nav>
      <!-- /Navigation -->

      <!-- ── Footer: user card ───────────────────────────────────────────── -->
      <div
        class="flex-shrink-0 border-t border-slate-100 p-3"
        [ngClass]="collapsed ? 'flex justify-center' : ''"
      >
        <!-- Expanded: full user card -->
        <div
          *ngIf="!collapsed"
          class="
            flex items-center gap-3 rounded-2xl border border-slate-200
            bg-slate-50 px-3 py-2.5
          "
        >
          <!-- Avatar -->
          <div
            class="
              flex h-8 w-8 flex-shrink-0 items-center justify-center
              rounded-full bg-emerald-600 text-xs font-bold text-white
              select-none
            "
          >
            {{ userInitials }}
          </div>

          <!-- Name + role -->
          <div class="min-w-0 flex-1 leading-tight">
            <div class="truncate text-xs font-semibold text-slate-800">
              {{ userName || 'Usuario' }}
            </div>
            <div class="text-[11px] text-slate-400">Administrador</div>
          </div>
        </div>

        <!-- Collapsed: just avatar with tooltip -->
        <div
          *ngIf="collapsed"
          class="
            flex h-9 w-9 items-center justify-center rounded-full
            bg-emerald-600 text-xs font-bold text-white select-none
          "
          [title]="userName || 'Usuario'"
        >
          {{ userInitials }}
        </div>
      </div>
      <!-- /Footer -->

      <!-- ── Expand button (collapsed mode, desktop) ─────────────────────── -->
      <div
        *ngIf="collapsed"
        class="flex-shrink-0 flex justify-center pb-4"
      >
        <button
          (click)="expand()"
          title="Expandir menú"
          class="
            hidden lg:flex h-8 w-8 items-center justify-center rounded-lg
            text-slate-400 hover:bg-slate-100 hover:text-slate-700
            transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-200
          "
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="chevronRight" />
          </svg>
        </button>
      </div>

    </aside>
    <!-- /Sidebar panel -->
  `,

  styles: [`
    /* Discrete scrollbar for nav */
    .sidebar-scroll::-webkit-scrollbar        { width: 4px; }
    .sidebar-scroll::-webkit-scrollbar-track  { background: transparent; }
    .sidebar-scroll::-webkit-scrollbar-thumb  { background: #e2e8f0; border-radius: 99px; }
    .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
    .sidebar-scroll {
      -ms-overflow-style: auto;
      scrollbar-width: thin;
      scrollbar-color: #e2e8f0 transparent;
    }
  `],
})
export class AdminSidebarComponent implements OnInit, OnDestroy {
  /** User full name shown in the bottom card */
  @Input() userName = '';

  /** Emits the collapsed state on every change so parent can adjust layout */
  @Output() collapsedChange = new EventEmitter<boolean>();

  private http = inject(HttpClient);
  private workflowState = inject(WorkflowStateService);
  private adminPeriodContext = inject(AdminPeriodContextService);
  private workflowSub?: Subscription;
  private periodSub?: Subscription;
  private refreshRequestId = 0;
  private readonly resizeHandler = () => this.checkMobile();

  readonly chevronLeft = ICON.chevronLeft;
  readonly chevronRight = ICON.chevronRight;

  // Clone groups to make them mutable
  groups: SidebarGroup[] = JSON.parse(JSON.stringify(ADMIN_SIDEBAR_GROUPS));

  collapsed = false;
  isMobile = false;

  // ── Computed ─────────────────────────────────────────────────────────────

  get userInitials(): string {
    return (this.userName || '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase() || '?';
  }

  badgeClass(tone: BadgeTone = 'slate'): string {
    return BADGE_CLASSES[tone] ?? BADGE_CLASSES['slate'];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  
  ngOnInit() {
    this.collapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    this.checkMobile();
    window.addEventListener('resize', this.resizeHandler);
    this.collapsedChange.emit(this.collapsed);
    this.workflowSub = this.workflowState.changes$.subscribe(() => {
      void this.refreshStatusWithRetry();
    });
    this.periodSub = this.adminPeriodContext.changes$
      .pipe(skip(1))
      .subscribe(() => {
        void this.refreshStatusWithRetry();
      });

    void this.refreshStatusWithRetry();
  }

  ngOnDestroy() {
    this.workflowSub?.unsubscribe();
    this.periodSub?.unsubscribe();
    window.removeEventListener('resize', this.resizeHandler);
  }

  // ── Workflow Status ──────────────────────────────────────────────────────

  private async refreshStatusWithRetry() {
    const requestId = ++this.refreshRequestId;
    const retryDelays = [0, 200, 400];
    for (const delay of retryDelays) {
      if (delay > 0) {
        await this.sleep(delay);
      }
      if (requestId !== this.refreshRequestId) return;
      try {
        const summary = await firstValueFrom(
          this.http.get<any>(`/api/admin/leveling/active-run-summary?t=${Date.now()}`)
        );
        if (requestId !== this.refreshRequestId) return;
        this.updateMenu(summary);
        return;
      } catch {
        // continue retries
      }
    }
    if (requestId !== this.refreshRequestId) return;
    console.warn('Could not fetch workflow status for sidebar');
  }

  updateMenu(s: any) {
    const nextGroups = JSON.parse(JSON.stringify(ADMIN_SIDEBAR_GROUPS));

    const disable = (route: string, queryParams?: Record<string, any>) => {
      for (const g of nextGroups) {
        for (const item of g.items) {
          if (item.route !== route) continue;
          if (!queryParams) {
            item.disabled = true;
            continue;
          }
          const matches = Object.entries(queryParams).every(
            ([key, value]) => item.queryParams?.[key] === value
          );
          if (matches) {
            item.disabled = true;
          }
        }
      }
    };

    const hasActivePeriod = Boolean(s?.activePeriod);
    const hasRun = Boolean(s?.run);
    const readyFaculties = Number(s?.metrics?.readyFaculties ?? 0);
    const assigned = Number(s?.metrics?.assignedInPeriod ?? s?.metrics?.assigned ?? 0);

    if (!hasActivePeriod) {
      disable('/admin/leveling');
    }

    if (!hasActivePeriod || !hasRun) {
      disable('/admin/sections', { view: 'schedule' });
    }

    if (!hasActivePeriod || !hasRun || assigned <= 0) {
      disable('/admin/sections', { view: 'students' });
    }

    if (!hasActivePeriod || !hasRun) {
      disable('/admin/reports/program');
      disable('/admin/reports/summary');
    }

    if (!hasActivePeriod || !hasRun || (readyFaculties <= 0 && assigned <= 0)) {
      disable('/admin/export');
    }

    if (!hasActivePeriod || !hasRun || readyFaculties <= 0) {
      disable('/admin/matricula');
    }

    this.groups = nextGroups;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  collapse() {
    this.collapsed = true;
    localStorage.setItem(STORAGE_KEY, 'true');
    this.collapsedChange.emit(true);
  }

  expand() {
    this.collapsed = false;
    localStorage.setItem(STORAGE_KEY, 'false');
    this.collapsedChange.emit(false);
  }

  toggle() {
    this.collapsed ? this.expand() : this.collapse();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private checkMobile() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 1024;

    // Auto-collapse when switching to mobile
    if (this.isMobile && !wasMobile && !this.collapsed) {
      this.collapse();
    }
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

