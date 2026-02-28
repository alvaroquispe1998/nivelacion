import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import type { AuthLoginRequest, AuthLoginResponse, AuthMeResponse, AuthUser, Role } from '@uai/shared';

const TOKEN_KEY = 'uai_token';
const USER_KEY = 'uai_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(
    this.readStoredUser()
  );

  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get user(): AuthUser | null {
    return this.userSubject.value;
  }

  get role(): Role | null {
    return (this.userSubject.value?.role ?? null) as Role | null;
  }

  async login(body: AuthLoginRequest): Promise<AuthLoginResponse> {
    const res = await firstValueFrom(
      this.http.post<AuthLoginResponse>('/api/auth/login', body)
    );
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.userSubject.next(res.user);
    return res;
  }

  async loadMe(): Promise<AuthUser | null> {
    if (!this.token) return null;
    try {
      const res = await firstValueFrom(
        this.http.get<AuthMeResponse>('/api/auth/me')
      );
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      this.userSubject.next(res.user);
      return res.user;
    } catch {
      this.logout();
      return null;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSubject.next(null);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
