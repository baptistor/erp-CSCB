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
        <div class="tab"><app-planning-calendar /></div>
      </mat-tab>
      <mat-tab label="Mes horaires types">
        <app-typical-week-form [selfOnly]="true" />
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `.tab { padding-top: 16px; }`,
})
export class PlanningPage {}
