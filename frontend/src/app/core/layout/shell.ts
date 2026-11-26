import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendarCog,
  lucideCalendarDays,
  lucideClipboardCheck,
  lucideClipboardList,
  lucideLogOut,
} from '@ng-icons/lucide';
import { filter, map } from 'rxjs';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardSidebarImports } from '@/shared/components/sidebar';
import { ZardSonnerComponent } from '@/shared/components/sonner';
import { PeopleFilter } from '../../features/planning/people-filter';
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
    NgIcon,
    PeopleFilter,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardSidebarImports,
    ZardSonnerComponent,
  ],
  viewProviders: [
    provideIcons({ lucideCalendarCog, lucideCalendarDays, lucideClipboardCheck, lucideClipboardList, lucideLogOut }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-sidebar-provider class="h-svh min-h-0 overflow-hidden">
      <z-sidebar>
        <z-sidebar-header>
          <span class="px-2 py-1 text-base font-semibold">Plannings &amp; congés</span>
        </z-sidebar-header>
        <z-sidebar-content>
          <z-sidebar-group>
            <ul z-sidebar-menu>
              @for (item of mainNav; track item.path) {
                <li z-sidebar-menu-item>
                  <a z-sidebar-menu-button [routerLink]="item.path" routerLinkActive #rla="routerLinkActive"
                     [zActive]="rla.isActive">
                    <ng-icon [name]="item.icon" />
                    <span>{{ item.label }}</span>
                  </a>
                </li>
              }
            </ul>
          </z-sidebar-group>
          @if (auth.isAdmin()) {
            <z-sidebar-group>
              <z-sidebar-group-label>Administration</z-sidebar-group-label>
              <ul z-sidebar-menu>
                @for (item of adminNav; track item.path) {
                  <li z-sidebar-menu-item>
                    <a z-sidebar-menu-button [routerLink]="item.path" routerLinkActive #rla="routerLinkActive"
                       [zActive]="rla.isActive">
                      <ng-icon [name]="item.icon" />
                      <span>{{ item.label }}</span>
                    </a>
                  </li>
                }
              </ul>
            </z-sidebar-group>
          }
          @if (onPlanning()) {
            <app-people-filter class="border-t" />
          }
        </z-sidebar-content>
      </z-sidebar>

      <main z-sidebar-inset class="min-h-0 overflow-hidden">
        <header class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <button z-sidebar-trigger></button>
          <span class="flex-1"></span>
          <span class="flex items-center gap-2 text-sm">
            {{ auth.displayName() }}
            @if (auth.isAdmin()) {
              <z-badge zType="secondary">Admin</z-badge>
            }
          </span>
          <button z-button zType="ghost" zSize="icon" (click)="auth.logout()"
                  aria-label="Se déconnecter" title="Se déconnecter">
            <ng-icon name="lucideLogOut" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-auto p-6">
          <router-outlet />
        </div>
      </main>
    </z-sidebar-provider>
    <z-sonner position="bottom-center" />
  `,
  styles: `
    :host { display: block; height: 100%; }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
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
    { path: '/planning', label: 'Planning', icon: 'lucideCalendarDays' },
    { path: '/mes-demandes', label: 'Mes demandes', icon: 'lucideClipboardList' },
  ];
  protected readonly adminNav: NavItem[] = [
    { path: '/admin/validations', label: 'Validations', icon: 'lucideClipboardCheck' },
    { path: '/admin/plannings', label: 'Plannings', icon: 'lucideCalendarCog' },
  ];
}
