import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { TypicalWeekForm } from '../admin/plannings/typical-week-form';
import { PlanningCalendar } from './planning-calendar';

@Component({
  selector: 'app-planning-page',
  imports: [MatTabsModule, PlanningCalendar, TypicalWeekForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- l'onglet et le menu portent déjà le titre : masqué à l'écran pour laisser la place au calendrier -->
    <h1 class="cdk-visually-hidden">Planning</h1>
    <mat-tab-group>
      <mat-tab label="Planning">
        <div class="tab"><app-planning-calendar /></div>
      </mat-tab>
      <mat-tab label="Mes horaires types">
        <app-typical-week-form [selfOnly]="true" />
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    :host { display: block; margin: -20px 0 -12px; --mat-tab-container-height: 40px; }
    .tab { padding-top: 4px; }
  `,
})
export class PlanningPage {}
