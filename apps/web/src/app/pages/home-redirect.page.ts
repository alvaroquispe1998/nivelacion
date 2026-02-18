import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Role } from '@uai/shared';
import { AuthService } from '../core/auth/auth.service';

@Component({
  standalone: true,
  template: ``,
})
export class HomeRedirectPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit() {
    if (!this.auth.user && this.auth.token) {
      await this.auth.loadMe();
    }
    const role = this.auth.user?.role;
    if (role === Role.ADMIN) {
      this.router.navigateByUrl('/admin/sections');
      return;
    }
    if (role === Role.ALUMNO) {
      this.router.navigateByUrl('/student/schedule');
      return;
    }
    if (role === Role.DOCENTE) {
      this.router.navigateByUrl('/teacher/schedule');
      return;
    }
    this.router.navigateByUrl('/login');
  }
}
