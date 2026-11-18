import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../api/api';
import { getMe } from '../../api/functions';
import { CurrentUser } from '../../api/models';

const DEV_EMAIL_KEY = 'erp.devUser';

/** Utilisateur courant. En dev, l'identité est simulée par un email (header X-Dev-User). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly devEmail = signal<string | null>(readDevEmail());
  readonly currentUser = signal<CurrentUser | null>(null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly displayName = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name || user.email;
  });

  /** Charge (une fois) l'utilisateur courant ; null si non authentifié. */
  async loadMe(): Promise<CurrentUser | null> {
    const cached = this.currentUser();
    if (cached) return cached;
    try {
      const user = await this.api.invoke(getMe);
      this.currentUser.set(user);
      return user;
    } catch {
      return null;
    }
  }

  async devLogin(email: string): Promise<CurrentUser | null> {
    this.setDevEmail(email.trim());
    this.currentUser.set(null);
    return this.loadMe();
  }

  logout(): void {
    this.setDevEmail(null);
    this.currentUser.set(null);
    void this.router.navigate(['/login']);
  }

  private setDevEmail(email: string | null): void {
    this.devEmail.set(email);
    try {
      if (email) localStorage.setItem(DEV_EMAIL_KEY, email);
      else localStorage.removeItem(DEV_EMAIL_KEY);
    } catch {
      // stockage indisponible : la session reste en mémoire
    }
  }
}

function readDevEmail(): string | null {
  try {
    return localStorage.getItem(DEV_EMAIL_KEY);
  } catch {
    return null;
  }
}
