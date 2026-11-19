import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { TypicalWeekForm } from '../admin/plannings/typical-week-form';
import { PlanningCalendar } from './planning-calendar';

@Component({
  selector: 'app-planning-page',
  imports: [MatTabsModule, PlanningCalendar, TypicalWeekForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Planning</h1>
    <mat-tab-group>
      <mat-tab label="Planning">
        <p class="hint">
          Vous pouvez modifier vos propres journées à partir d'aujourd'hui : cliquez sur l'une d'elles,
          ou sélectionnez un jour libre. Chaque journée travaillée doit respecter votre minimum d'heures.
        </p>
        <app-planning-calendar />
      </mat-tab>
      <mat-tab label="Mes horaires types">
        <app-typical-week-form [selfOnly]="true" />
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `.hint { color: var(--mat-sys-on-surface-variant); margin: 16px 0; }`,
})
export class PlanningPage {}
