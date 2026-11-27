import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { BalancesAdmin } from './balances-admin';
import { SchoolHolidaysAdmin } from './school-holidays-admin';
import { TypicalWeekForm } from './typical-week-form';

/**
 * /admin/plannings : semaines type et contrat de chaque employé, semaines de vacances scolaires, soldes (spec).
 * Pas de calendrier éditable ici : depuis le planning, chacun n'agit que sur son propre emploi du temps.
 */
@Component({
  selector: 'app-plannings-page',
  imports: [MatTabsModule, TypicalWeekForm, SchoolHolidaysAdmin, BalancesAdmin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Édition des plannings</h1>
    <mat-tab-group [selectedIndex]="tabIndex()">
      <mat-tab label="Horaires">
        <app-typical-week-form />
      </mat-tab>
      <mat-tab label="Vacances scolaires">
        <app-school-holidays-admin />
      </mat-tab>
      <mat-tab label="Soldes">
        <app-balances-admin />
      </mat-tab>
    </mat-tab-group>
  `,
})
export class PlanningsPage {
  /** ?onglet=vacances|soldes (lien du bandeau d'avertissement). */
  readonly onglet = input<string>();
  protected readonly tabIndex = computed(() => Math.max(0, ['horaires', 'vacances', 'soldes'].indexOf(this.onglet() ?? '')));
}
