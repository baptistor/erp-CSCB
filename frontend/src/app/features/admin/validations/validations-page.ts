import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api/api';
import { decideAbsence, decideOvertime, getPendingRequests, getUsers } from '../../../api/functions';
import { AbsenceRequest, OvertimeRequest, Requests, UserSummary } from '../../../api/models';
import { errorMessage } from '../../../shared/dates';
import { ABSENCE_TYPE_LABELS, formatHours } from '../../../shared/requests';
import { fullName } from '../../../shared/user-color';
import { DecisionDialog, DecisionDialogData } from './decision-dialog';

/** /admin/validations : demandes PENDING de tous, à approuver ou refuser. */
@Component({
  selector: 'app-validations-page',
  imports: [DatePipe, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Validations</h1>
    @if (pending(); as p) {
      <h2>Heures supplémentaires ({{ p.overtimes.length }})</h2>
      @if (p.overtimes.length) {
        <table>
          <thead><tr><th>Employé</th><th>Date</th><th class="num">Heures</th><th>Motif</th><th>Demandée le</th><th></th></tr></thead>
          <tbody>
            @for (o of p.overtimes; track o.id) {
              <tr>
                <td>{{ name(o.userId) }}</td>
                <td>{{ o.date | date: 'dd/MM/yyyy' }}</td>
                <td class="num">{{ hours(o.hours) }}</td>
                <td>{{ o.reason }}</td>
                <td>{{ o.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="buttons">
                  <button mat-flat-button (click)="decideOvertime(o, true)">Approuver</button>
                  <button mat-button class="reject" (click)="decideOvertime(o, false)">Refuser</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="empty">Aucune déclaration en attente.</p>
      }

      <h2>Absences ({{ p.absences.length }})</h2>
      @if (p.absences.length) {
        <table>
          <thead><tr><th>Employé</th><th>Type</th><th>Période</th><th class="num">Heures</th><th>Commentaire</th><th>Demandée le</th><th></th></tr></thead>
          <tbody>
            @for (a of p.absences; track a.id) {
              <tr>
                <td>{{ name(a.userId) }}</td>
                <td>{{ typeLabels[a.type] }}</td>
                <td>
                  {{ a.startDate | date: 'dd/MM/yyyy' }}
                  @if (a.startTime) {
                    de {{ a.startTime }} à {{ a.endTime }}
                  } @else if (a.endDate !== a.startDate) {
                    → {{ a.endDate | date: 'dd/MM/yyyy' }} (journées entières)
                  } @else {
                    (journée entière)
                  }
                </td>
                <td class="num">{{ hours(a.hours) }}</td>
                <td>{{ a.comment }}</td>
                <td>{{ a.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="buttons">
                  <button mat-flat-button (click)="decideAbsence(a, true)">Approuver</button>
                  <button mat-button class="reject" (click)="decideAbsence(a, false)">Refuser</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="empty">Aucune absence en attente.</p>
      }
    }
  `,
  styles: `
    h2 { font: var(--mat-sys-title-large); margin: 24px 0 8px; }
    table { border-collapse: collapse; width: 100%; }
    th { text-align: left; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    th, td { padding: 6px 12px 6px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); vertical-align: middle; }
    .num { text-align: right; white-space: nowrap; }
    .buttons { white-space: nowrap; text-align: right; }
    .reject { color: var(--mat-sys-error); }
    .empty { color: var(--mat-sys-on-surface-variant); }
  `,
})
export class ValidationsPage {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly pending = signal<Requests | null>(null);
  private readonly users = signal<UserSummary[]>([]);
  private readonly usersById = computed(() => new Map(this.users().map((u) => [u.id, u])));
  protected readonly typeLabels = ABSENCE_TYPE_LABELS;
  protected readonly hours = (h: number) => formatHours(h);

  constructor() {
    void this.api.invoke(getUsers).then((users) => this.users.set(users));
    void this.reload();
  }

  protected name(userId: number): string {
    const user = this.usersById().get(userId);
    return user ? fullName(user) : `#${userId}`;
  }

  protected async decideOvertime(o: OvertimeRequest, approved: boolean): Promise<void> {
    const summary = `${this.name(o.userId)} — ${formatHours(o.hours)} d'heures sup le ${o.date.split('-').reverse().join('/')}`;
    const result = await this.confirm(approved, summary);
    if (result) {
      await this.run(() => this.api.invoke(decideOvertime, { id: o.id, body: { approved, comment: result.comment } }), approved);
    }
  }

  protected async decideAbsence(a: AbsenceRequest, approved: boolean): Promise<void> {
    const summary = `${this.name(a.userId)} — ${ABSENCE_TYPE_LABELS[a.type]}, ${formatHours(a.hours)}`;
    const result = await this.confirm(approved, summary);
    if (result) {
      await this.run(() => this.api.invoke(decideAbsence, { id: a.id, body: { approved, comment: result.comment } }), approved);
    }
  }

  private confirm(approved: boolean, summary: string) {
    return firstValueFrom(
      this.dialog
        .open<DecisionDialog, DecisionDialogData, { comment: string | null }>(DecisionDialog, { data: { approved, summary } })
        .afterClosed(),
    );
  }

  private async run(call: () => Promise<unknown>, approved: boolean): Promise<void> {
    try {
      await call();
      this.snack.open(approved ? 'Demande approuvée' : 'Demande refusée', 'OK', { duration: 4000 });
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.pending.set(await this.api.invoke(getPendingRequests));
    } catch (error) {
      this.snack.open(errorMessage(error, 'Impossible de charger les demandes'), 'OK', { duration: 6000 });
    }
  }
}
