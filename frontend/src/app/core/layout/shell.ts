import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../auth/auth.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar class="topbar">
      <span class="brand">Plannings &amp; congés</span>
      <span class="spacer"></span>
      <span class="user">
        {{ auth.displayName() }}
        @if (auth.isAdmin()) {
          <span class="badge">Admin</span>
        }
      </span>
      <button mat-icon-button (click)="auth.logout()" aria-label="Se déconnecter" title="Se déconnecter">
        <mat-icon>logout</mat-icon>
      </button>
    </mat-toolbar>
    <mat-sidenav-container class="container">
      <mat-sidenav mode="side" opened class="sidenav">
        <mat-nav-list>
          @for (item of mainNav; track item.path) {
            <a mat-list-item [routerLink]="item.path" routerLinkActive #rla="routerLinkActive" [activated]="rla.isActive">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
          @if (auth.isAdmin()) {
            <h3 matSubheader>Administration</h3>
            @for (item of adminNav; track item.path) {
              <a mat-list-item [routerLink]="item.path" routerLinkActive #rla="routerLinkActive" [activated]="rla.isActive">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          }
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content class="content">
        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; }
    .topbar { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
    .topbar button { color: inherit; }
    .spacer { flex: 1; }
    .user { font: var(--mat-sys-body-medium); margin-right: 8px; display: flex; align-items: center; gap: 8px; }
    .badge { font: var(--mat-sys-label-small); padding: 2px 8px; border-radius: 8px;
      background: var(--mat-sys-tertiary-container); color: var(--mat-sys-on-tertiary-container); }
    .container { flex: 1; }
    .sidenav { width: 240px; }
    /* border-box : le padding reste inclus dans la hauteur (100 %) de la zone de contenu, sinon le bas des pages
       dépasse de l'écran et se retrouve coupé */
    .content { padding: 24px; box-sizing: border-box; }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);

  protected readonly mainNav: NavItem[] = [
    { path: '/planning', label: 'Planning', icon: 'calendar_month' },
    { path: '/mes-demandes', label: 'Mes demandes', icon: 'assignment' },
  ];
  protected readonly adminNav: NavItem[] = [
    { path: '/admin/validations', label: 'Validations', icon: 'fact_check' },
    { path: '/admin/plannings', label: 'Plannings', icon: 'edit_calendar' },
  ];
}
