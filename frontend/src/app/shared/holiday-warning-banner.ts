import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { HolidayCalendarStore } from './holiday-calendar';

/** Bandeau admin : calendrier des vacances scolaires à valider (spec §1), avec lien vers l'onglet. */
@Component({
  selector: 'app-holiday-warning-banner',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.warning(); as warning) {
      <div class="banner" role="alert">
        <mat-icon>warning</mat-icon>
        <span>{{ warning }}</span>
        <a mat-button routerLink="/admin/plannings" [queryParams]="{ onglet: 'vacances' }">Valider le calendrier</a>
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 2px 4px 2px 12px; border-radius: 8px;
      background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container); font: var(--mat-sys-body-medium);
    }
    .banner span { flex: 1; }
    .banner a { color: inherit; font-weight: 600; }
  `,
})
export class HolidayWarningBanner {
  protected readonly store = inject(HolidayCalendarStore);
}
