import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PeopleFilter } from '../../features/planning/people-filter';
import { HolidayCalendarStore } from '../../shared/holiday-calendar';
import { AuthService } from '../auth/auth.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const isPlanning = (url: string) => url.split(/[?#]/)[0] === '/planning';

@Component({
  selector: 'app-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    PeopleFilter,
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
                <span matListItemTitle>
                  {{ item.label }}
                  @if (item.path === '/admin/plannings' && holidays.warning()) {
                    <span class="dot" title="Calendrier des vacances scolaires à valider" aria-label="à valider"></span>
                  }
                </span>
              </a>
            }
          }
        </mat-nav-list>
        @if (onPlanning()) {
          <app-people-filter />
        }
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
    .dot { display: inline-block; width: 8px; height: 8px; margin-left: 6px; border-radius: 50%; vertical-align: middle;
      background: var(--mat-sys-error); }
    .sidenav { width: 240px; }
    /* le menu garde sa taille ; la liste des collaborateurs défile dans la place restante */
    .sidenav ::ng-deep .mat-drawer-inner-container { display: flex; flex-direction: column; }
    mat-nav-list { flex: none; }
    app-people-filter { flex: 0 1 auto; border-top: 1px solid var(--mat-sys-outline-variant); }
    /* border-box : le padding reste inclus dans la hauteur (100 %) de la zone de contenu, sinon le bas des pages
       dépasse de l'écran et se retrouve coupé */
    .content { padding: 24px; box-sizing: border-box; }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly holidays = inject(HolidayCalendarStore);
  private readonly router = inject(Router);

  /** La liste des emplois du temps affichés n'apparaît dans le menu que sur l'écran Planning. */
  protected readonly onPlanning = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => isPlanning(event.urlAfterRedirects)),
    ),
    { initialValue: isPlanning(this.router.url) },
  );

  protected readonly mainNav: NavItem[] = [
    { path: '/planning', label: 'Planning', icon: 'calendar_month' },
  ];
  protected readonly adminNav: NavItem[] = [
    { path: '/admin/validations', label: 'Validations', icon: 'fact_check' },
    { path: '/admin/plannings', label: 'Plannings', icon: 'edit_calendar' },
  ];
}
