import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { PlanningCalendar } from '../../planning/planning-calendar';
import { TypicalWeekForm } from './typical-week-form';

@Component({
  selector: 'app-plannings-page',
  imports: [MatTabsModule, PlanningCalendar, TypicalWeekForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Édition des plannings</h1>
    <mat-tab-group>
      <mat-tab label="Planning">
        <p class="hint">
          Cliquez sur une journée pour la modifier à cette date (journée spéciale), étirez-la ou déplacez-la
          pour changer ses heures, ou sélectionnez une plage vide pour créer une journée spéciale.
        </p>
        <app-planning-calendar [adminMode]="true" />
      </mat-tab>
      <mat-tab label="Horaires types">
        <app-typical-week-form />
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `.hint { color: var(--mat-sys-on-surface-variant); margin: 16px 0; }`,
})
export class PlanningsPage {}
