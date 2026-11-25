import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../../../api/api';
import { getSchoolHolidayWeeks, markSchoolHolidayWeek, unmarkSchoolHolidayWeek } from '../../../api/functions';
import { addDays, errorMessage, toIsoDate } from '../../../shared/dates';
import { weekDays } from '../../planning/week-grid-layout';

const WEEKS = 52;
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lundis des `count` semaines à venir (la semaine en cours n'est plus modifiable), groupés par mois. */
export function upcomingWeeks(today: string, count: number): { month: string; mondays: string[] }[] {
  const groups: { month: string; mondays: string[] }[] = [];
  const first = addDays(weekDays(parse(today))[0], 7);
  for (let i = 0; i < count; i++) {
    const monday = addDays(first, i * 7);
    const month = MONTH.format(parse(monday));
    if (groups.at(-1)?.month !== month) groups.push({ month, mondays: [] });
    groups.at(-1)!.mondays.push(monday);
  }
  return groups;
}

/** Admin : marquer à l'avance les semaines de vacances scolaires, communes à tous (spec §1). */
@Component({
  selector: 'app-school-holidays-admin',
  imports: [MatCheckboxModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="info">
      Cochez les semaines de vacances scolaires : les horaires « vacances » de chaque employé s'y appliquent.
      La semaine en cours et les semaines passées ne sont plus modifiables.
    </p>
    @if (marked.hasValue()) {
      <div class="months">
        @for (group of groups; track group.month) {
          <section>
            <h3>{{ group.month }}</h3>
            @for (monday of group.mondays; track monday) {
              <mat-checkbox [checked]="isMarked(monday)" [disabled]="saving()" (change)="toggle(monday, $event.checked)">
                {{ label(monday) }}
              </mat-checkbox>
            }
          </section>
        }
      </div>
    } @else if (marked.error()) {
      <p class="error">Impossible de charger les semaines de vacances.</p>
    }
  `,
  styles: `
    :host { display: block; padding-top: 16px; }
    .info { color: var(--mat-sys-on-surface-variant); margin: 0 0 16px; }
    .error { color: var(--mat-sys-error); }
    .months { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px 24px; }
    section { display: flex; flex-direction: column; }
    h3 { margin: 0; font: var(--mat-sys-title-medium); }
    h3::first-letter { text-transform: uppercase; }
  `,
})
export class SchoolHolidaysAdmin {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);

  protected readonly groups = upcomingWeeks(toIsoDate(new Date()), WEEKS);
  protected readonly saving = signal(false);
  protected readonly marked = resource({ loader: () => this.api.invoke(getSchoolHolidayWeeks) });
  private readonly markedSet = computed(() => new Set(this.marked.hasValue() ? this.marked.value() : []));

  protected isMarked(monday: string): boolean {
    return this.markedSet().has(monday);
  }

  protected label(monday: string): string {
    return `${SHORT.format(parse(monday))} – ${SHORT.format(parse(addDays(monday, 6)))}`;
  }

  protected async toggle(weekStart: string, checked: boolean): Promise<void> {
    this.saving.set(true);
    try {
      await this.api.invoke(checked ? markSchoolHolidayWeek : unmarkSchoolHolidayWeek, { weekStart });
      this.snack.open(checked ? 'Semaine marquée « vacances scolaires »' : 'Semaine redevenue classique', 'OK', {
        duration: 3000,
      });
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
    }
    this.saving.set(false);
    this.marked.reload();
  }
}
