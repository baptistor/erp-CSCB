import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Connexion simulée (profil dev du back) — remplacée par le SSO Entra ID en prod. */
@Component({
  selector: 'app-dev-login',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="login" appearance="outlined">
      <mat-card-header>
        <mat-card-title>Connexion (mode développement)</mat-card-title>
        <mat-card-subtitle>Identité simulée, sans SSO</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form (ngSubmit)="login(email)">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Email</mat-label>
            <input matInput type="email" name="email" [(ngModel)]="email" required />
          </mat-form-field>
          <button mat-flat-button type="submit" [disabled]="!email || pending()">Se connecter</button>
        </form>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
        <p class="hint">Comptes de démo :</p>
        <div class="quick">
          @for (demo of demoUsers; track demo) {
            <button mat-stroked-button type="button" (click)="login(demo)" [disabled]="pending()">
              {{ demo }}
            </button>
          }
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host { display: flex; justify-content: center; padding: 48px 16px; }
    .login { width: 100%; max-width: 460px; }
    .full { width: 100%; margin-top: 16px; }
    .quick { display: flex; flex-direction: column; gap: 8px; }
    .hint { margin-top: 24px; color: var(--mat-sys-on-surface-variant); }
    .error { color: var(--mat-sys-error); }
  `,
})
export class DevLogin {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = this.auth.devEmail() ?? '';
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly demoUsers = [
    'admin@exemple.fr',
    'alice.martin@exemple.fr',
    'bruno.durand@exemple.fr',
    'chloe.bernard@exemple.fr',
  ];

  protected async login(email: string): Promise<void> {
    this.pending.set(true);
    this.error.set(null);
    const user = await this.auth.devLogin(email);
    this.pending.set(false);
    if (user) {
      await this.router.navigate(['/planning']);
    } else {
      this.error.set('Connexion refusée (email inconnu du domaine autorisé ou back injoignable).');
    }
  }
}
