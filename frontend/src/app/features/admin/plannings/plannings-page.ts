import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-plannings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Édition des plannings</h1>
    <p>Créneaux et ajustements de solde — à venir.</p>
  `,
})
export class PlanningsPage {}
