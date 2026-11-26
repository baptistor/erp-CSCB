import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { AuthService } from './auth.service';

/** Connexion simulée (profil dev du back) — remplacée par le SSO Entra ID en prod. */
@Component({
  selector: 'app-dev-login',
  imports: [FormsModule, ZardButtonComponent, ZardCardImports, ZardFieldImports, ZardInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-card class="w-full max-w-[460px]">
      <z-card-header>
        <z-card-title>Connexion (mode développement)</z-card-title>
        <z-card-description>Identité simulée, sans SSO</z-card-description>
      </z-card-header>
      <z-card-content class="flex flex-col gap-6">
        <form class="flex flex-col gap-4" (ngSubmit)="login(email)">
          <z-field>
            <label z-field-label for="email">Email</label>
            <input z-input id="email" type="email" name="email" [(ngModel)]="email" required />
          </z-field>
          <button z-button type="submit" class="self-start" [disabled]="!email || pending()">Se connecter</button>
        </form>
        @if (error()) {
          <p class="text-sm text-destructive">{{ error() }}</p>
        }
        <div class="flex flex-col gap-2">
          <p class="text-sm text-muted-foreground">Comptes de démo :</p>
          @for (demo of demoUsers; track demo) {
            <button z-button zType="outline" type="button" (click)="login(demo)" [disabled]="pending()">
              {{ demo }}
            </button>
          }
        </div>
      </z-card-content>
    </z-card>
  `,
  styles: `
    :host { display: flex; justify-content: center; padding: 48px 16px; }
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
    'david.petit@exemple.fr',
    'emma.robert@exemple.fr',
    'farid.benali@exemple.fr',
    'gaelle.moreau@exemple.fr',
    'hugo.lefevre@exemple.fr',
    'ines.garcia@exemple.fr',
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
