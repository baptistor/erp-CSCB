import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Balance } from '../api/models';
import { formatHours } from './requests';

/** Solde actuel, disponible et historique des mouvements (heures sup, récup, ajustements). */
@Component({
  selector: 'app-balance-view',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="figures">
      <div class="figure">
        <span class="label">Solde d'heures sup</span>
        <span class="value">{{ hours(balance().balance) }}</span>
      </div>
      <div class="figure">
        <span class="label">Disponible</span>
        <span class="value">{{ hours(balance().available) }}</span>
        <span class="hint">solde − récupérations en attente</span>
      </div>
    </div>
    <h3>Historique</h3>
    @if (balance().movements.length) {
      <table class="movements">
        <thead><tr><th>Date</th><th>Mouvement</th><th class="num">Heures</th></tr></thead>
        <tbody>
          @for (m of balance().movements; track $index) {
            <tr>
              <td>{{ m.date | date: 'dd/MM/yyyy' }}</td>
              <td>{{ m.label }}</td>
              <td class="num" [class.neg]="m.hours < 0">{{ hours(m.hours, true) }}</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="empty">Aucun mouvement pour l'instant.</p>
    }
  `,
  styles: `
    .figures { display: flex; gap: 16px; flex-wrap: wrap; }
    .figure { display: flex; flex-direction: column; padding: 12px 20px; border-radius: 12px;
      background: var(--mat-sys-surface-container); min-width: 180px; }
    .label { font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    .value { font: var(--mat-sys-headline-medium); }
    .hint { font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); }
    h3 { font: var(--mat-sys-title-medium); margin: 24px 0 8px; }
    .movements { border-collapse: collapse; width: 100%; max-width: 720px; }
    .movements th { text-align: left; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    .movements th, .movements td { padding: 6px 12px 6px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .num { text-align: right; white-space: nowrap; }
    .neg { color: var(--mat-sys-error); }
    .empty { color: var(--mat-sys-on-surface-variant); }
  `,
})
export class BalanceView {
  readonly balance = input.required<Balance>();
  protected readonly hours = formatHours;
}
