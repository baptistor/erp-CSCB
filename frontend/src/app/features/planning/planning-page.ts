import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ZardTabsImports } from '@/shared/components/tabs';
import { TypicalWeekForm } from '../admin/plannings/typical-week-form';
import { PlanningCalendar } from './planning-calendar';

@Component({
  selector: 'app-planning-page',
  imports: [PlanningCalendar, TypicalWeekForm, ZardTabsImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- l'onglet et le menu portent déjà le titre : masqué à l'écran pour laisser la place au calendrier -->
    <h1 class="sr-only">Planning</h1>
    <z-tab-group>
      <z-tab label="Planning">
        <app-planning-calendar />
      </z-tab>
      <z-tab label="Mes horaires types">
        <div class="mx-auto max-w-5xl pt-6"><app-typical-week-form [selfOnly]="true" /></div>
      </z-tab>
    </z-tab-group>
  `,
  styles: `
    :host { display: block; margin: -12px 0 -12px; }
  `,
})
export class PlanningPage {}
