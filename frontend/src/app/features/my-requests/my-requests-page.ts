import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-my-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Mes demandes</h1>
    <p>Heures supplémentaires, absences et solde d'heures — à venir.</p>
  `,
})
export class MyRequestsPage {}
