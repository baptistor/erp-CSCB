import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api/api';
import { cancelOvertime, declareOvertime, getMyBalance, getMyRequests } from '../../api/functions';
import { Balance, OvertimeInput, Requests } from '../../api/models';
import { BalanceView } from '../../shared/balance-view';
import { errorMessage } from '../../shared/dates';
import { formatHours, STATUS_LABELS } from '../../shared/requests';
import { OvertimeDialog } from './overtime-dialog';

/**
 * /mes-demandes : heures supplémentaires uniquement (spec) — déclaration, mes déclarations, solde et historique.
 * Les absences se posent directement sur le planning (mode Édition).
 */
@Component({
  selector: 'app-my-requests-page',
  imports: [DatePipe, MatButtonModule, MatIconModule, RouterLink, BalanceView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Mes demandes</h1>
    <div class="actions">
      <button mat-flat-button (click)="declare()"><mat-icon>more_time</mat-icon> Déclarer des heures</button>
      <a mat-button routerLink="/planning">
        <mat-icon>event_busy</mat-icon> Poser une absence : depuis le planning
      </a>
    </div>

    @if (balance(); as b) {
      <section>
        <app-balance-view [balance]="b" />
      </section>
    }

    @if (requests(); as r) {
      <section>
        <h2>Mes heures supplémentaires</h2>
        @if (r.overtimes.length) {
          <table>
            <thead><tr><th>Date</th><th class="num">Heures</th><th>Motif</th><th>Statut</th><th>Commentaire admin</th><th></th></tr></thead>
            <tbody>
              @for (o of r.overtimes; track o.id) {
                <tr>
                  <td>{{ o.date | date: 'dd/MM/yyyy' }}</td>
                  <td class="num">{{ hours(o.hours) }}</td>
                  <td>{{ o.reason }}</td>
                  <td><span class="status" [attr.data-status]="o.status">{{ statusLabels[o.status] }}</span></td>
                  <td>{{ o.adminComment }}</td>
                  <td>
                    @if (o.status === 'PENDING') {
                      <button mat-button (click)="cancel(o.id)">Annuler</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="empty">Aucune déclaration.</p>
        }
      </section>
    }
  `,
  styles: `
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
    section { margin-bottom: 32px; }
    h2 { font: var(--mat-sys-title-large); margin: 24px 0 8px; }
    table { border-collapse: collapse; width: 100%; }
    th { text-align: left; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    th, td { padding: 6px 12px 6px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); vertical-align: middle; }
    .num { text-align: right; white-space: nowrap; }
    .empty { color: var(--mat-sys-on-surface-variant); }
    .status { font: var(--mat-sys-label-medium); padding: 2px 10px; border-radius: 12px; white-space: nowrap;
      background: var(--mat-sys-surface-container-high); }
    .status[data-status='PENDING'] { background: #fff4ce; color: #5c4400; }
    .status[data-status='APPROVED'] { background: #d7f5dd; color: #0d5a1f; }
    .status[data-status='REJECTED'] { background: #fde0e0; color: #8c1d18; }
  `,
})
export class MyRequestsPage {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly requests = signal<Requests | null>(null);
  protected readonly balance = signal<Balance | null>(null);
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly hours = (h: number) => formatHours(h);

  constructor() {
    void this.reload();
  }

  protected async declare(): Promise<void> {
    const input = await firstValueFrom(this.dialog.open<OvertimeDialog, void, OvertimeInput>(OvertimeDialog).afterClosed());
    if (input) await this.run(() => this.api.invoke(declareOvertime, { body: input }), 'Heures déclarées, en attente de validation');
  }

  protected async cancel(id: number): Promise<void> {
    await this.run(() => this.api.invoke(cancelOvertime, { id }), 'Déclaration annulée');
  }

  private async run(call: () => Promise<unknown>, success: string): Promise<void> {
    try {
      await call();
      this.snack.open(success, 'OK', { duration: 4000 });
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const [requests, balance] = await Promise.all([this.api.invoke(getMyRequests), this.api.invoke(getMyBalance)]);
      this.requests.set(requests);
      this.balance.set(balance);
    } catch (error) {
      this.snack.open(errorMessage(error, 'Impossible de charger vos demandes'), 'OK', { duration: 6000 });
    }
  }
}
