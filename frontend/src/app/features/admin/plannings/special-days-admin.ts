import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api/api';
import { createSpecialDay, deleteSpecialDay, getPlanning, updateSpecialDay } from '../../../api/functions';
import { PlanningDay, UserSummary } from '../../../api/models';
import { addDays, errorMessage, toIsoDate } from '../../../shared/dates';
import { defaultExtra } from '../../../shared/schedule-rules';
import { DayDialog, DayDialogData, DayDialogResult } from '../../planning/day-dialog';

const HORIZON_DAYS = 62;
const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Admin : heures ajoutées à venir d'un employé (ajout / modification / retrait), en dehors de sa journée type. */
@Component({
  selector: 'app-special-days-admin',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Heures ajoutées à venir ({{ horizon }} jours)</h3>
    <button mat-stroked-button type="button" (click)="add()">Ajouter des heures</button>
    @if (specialDays().length) {
      <table>
        <thead><tr><th>Date</th><th>Horaires</th><th></th></tr></thead>
        <tbody>
          @for (d of specialDays(); track d.date + d.startTime) {
            <tr>
              <td>{{ longDate(d.date) }}</td>
              <td>{{ d.startTime }}–{{ d.endTime }}</td>
              <td class="actions">
                <button mat-button type="button" (click)="edit(d)">Modifier</button>
                <button mat-button type="button" class="danger" (click)="remove(d)">Retirer</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else if (planning.hasValue()) {
      <p class="empty">Aucune heure ajoutée à venir : la semaine type s'applique.</p>
    }
  `,
  styles: `
    :host { display: block; margin-top: 32px; }
    h3 { font: var(--mat-sys-title-medium); margin: 0 0 8px; }
    table { border-collapse: collapse; margin-top: 12px; min-width: 480px; }
    th { text-align: left; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    th, td { padding: 6px 12px 6px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    td:first-child::first-letter { text-transform: uppercase; }
    .actions { text-align: right; white-space: nowrap; }
    .danger { color: var(--mat-sys-error); }
    .empty { color: var(--mat-sys-on-surface-variant); }
  `,
})
export class SpecialDaysAdmin {
  readonly user = input.required<UserSummary>();

  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly horizon = HORIZON_DAYS;
  private readonly today = toIsoDate(new Date());

  protected readonly planning = resource({
    params: () => ({ userId: this.user().id }),
    loader: () => this.api.invoke(getPlanning, { from: this.today, to: addDays(this.today, HORIZON_DAYS) }),
  });

  protected readonly specialDays = computed(() =>
    this.planning.hasValue()
      ? this.planning.value().days.filter((d) => d.userId === this.user().id && d.specialDayId != null)
      : [],
  );

  protected longDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return LONG_DATE.format(new Date(y, m - 1, d));
  }

  protected async add(): Promise<void> {
    const { start, end } = defaultExtra(this.day(this.today).typical);
    const result = await this.open({ date: this.today, startTime: start, endTime: end });
    if (result?.action === 'save') {
      await this.run(() => this.api.invoke(createSpecialDay, { body: result.input }), 'Heures ajoutées');
    }
  }

  protected async edit(day: PlanningDay): Promise<void> {
    const id = day.specialDayId!;
    const result = await this.open({ date: day.date, startTime: day.startTime, endTime: day.endTime }, id);
    if (result?.action === 'save') {
      await this.run(() => this.api.invoke(updateSpecialDay, { id, body: result.input }), 'Heures ajoutées modifiées');
    } else if (result?.action === 'remove') {
      await this.remove(day);
    }
  }

  protected async remove(day: PlanningDay): Promise<void> {
    const id = day.specialDayId!;
    await this.run(() => this.api.invoke(deleteSpecialDay, { id }), 'Heures ajoutées retirées');
  }

  private day(date: string, ignoredId?: number): ReturnType<DayDialogData['dayOf']> {
    const days = this.planning.hasValue()
      ? this.planning.value().days.filter((d) => d.userId === this.user().id && d.date === date)
      : [];
    return {
      typical: days.filter((d) => d.specialDayId == null).map((d) => ({ start: d.startTime, end: d.endTime })),
      others: days
        .filter((d) => d.specialDayId != null && d.specialDayId !== ignoredId)
        .map((d) => ({ start: d.startTime, end: d.endTime })),
    };
  }

  private open(initial: DayDialogData['initial'], extraId?: number): Promise<DayDialogResult | undefined> {
    const data: DayDialogData = {
      user: this.user(),
      initial,
      existing: extraId != null,
      dayOf: (date) => this.day(date, extraId),
    };
    return firstValueFrom(this.dialog.open<DayDialog, DayDialogData, DayDialogResult>(DayDialog, { data }).afterClosed());
  }

  private async run(call: () => Promise<unknown>, success: string): Promise<void> {
    try {
      await call();
      this.snack.open(success, 'OK', { duration: 4000 });
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
    }
    this.planning.reload();
  }
}
