import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-planning-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Planning</h1>
    <p>Planning de toute l'équipe — à venir.</p>
  `,
})
export class PlanningPage {}
