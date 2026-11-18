import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-validations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Validations</h1>
    <p>Demandes en attente — à venir.</p>
  `,
})
export class ValidationsPage {}
