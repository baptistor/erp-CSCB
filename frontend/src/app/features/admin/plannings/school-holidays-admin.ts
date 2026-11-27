import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api/api';
import { getPlanning, getSchoolHolidayWeeks, markSchoolHolidayWeek, unmarkSchoolHolidayWeek } from '../../../api/functions';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/confirm-dialog';
import { addDays, errorMessage, liveToday, toIsoDate } from '../../../shared/dates';
import { endOfMonth, HolidayCalendarStore, longDate, suggestedValidation } from '../../../shared/holiday-calendar';
import { weekDays } from '../../planning/week-grid-layout';

const WEEKS = 52;
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface WeekRow {
  monday: string;
  days: { date: string; day: number; inMonth: boolean }[];
}

export interface MonthGrid {
  label: string;
  /** Dernier jour du mois (pour « Valider jusqu'ici »). */
  last: string;
  weeks: WeekRow[];
}

/**
 * Mois couvrant les `count` semaines à venir, en calendrier (une ligne = une semaine, du lundi au dimanche). Une
 * semaine à cheval sur deux mois apparaît dans les deux. La première semaine modifiable est la suivante.
 */
export function holidayMonths(today: string, count: number): { firstMonday: string; lastMonday: string; months: MonthGrid[] } {
  const firstMonday = addDays(weekDays(parse(today))[0], 7);
  const lastMonday = addDays(firstMonday, (count - 1) * 7);
  const months: MonthGrid[] = [];
  const start = parse(firstMonday);
  const end = parse(lastMonday);
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const lastDay = toIsoDate(new Date(m.getFullYear(), m.getMonth() + 1, 0));
    const weeks: WeekRow[] = [];
    for (let monday = weekDays(m)[0]; monday <= lastDay; monday = addDays(monday, 7)) {
      weeks.push({
        monday,
        days: Array.from({ length: 7 }, (_, i) => {
          const date = parse(addDays(monday, i));
          return { date: toIsoDate(date), day: date.getDate(), inMonth: date.getMonth() === m.getMonth() };
        }),
      });
    }
    months.push({ label: MONTH.format(m), last: lastDay, weeks });
  }
  return { firstMonday, lastMonday, months };
}

/** Admin : marquer à l'avance les semaines de vacances scolaires, communes à tous (spec §1). */
@Component({
  selector: 'app-school-holidays-admin',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <p class="info">
        Cliquez sur une semaine pour la passer en <strong>vacances scolaires</strong> : les horaires « vacances » de
        chaque employé s'y appliquent. <kbd>Maj</kbd> + clic marque toute une période d'un coup.
      </p>
      <div class="legend">
        <span><i class="swatch holiday"></i>Vacances ({{ count() }})</span>
        <span><i class="swatch"></i>Classique</span>
        <span><i class="swatch locked"></i>Passée</span>
      </div>
    </div>

    @if (holidays.calendar(); as cal) {
      @if (cal.late) {
        <div class="status late" role="alert">
          <mat-icon>warning</mat-icon>
          <span>{{ holidays.warning() }}</span>
          <button mat-flat-button type="button" [disabled]="validating()" (click)="validate(suggested())">
            Valider jusqu'au {{ long(suggested()) }}
          </button>
        </div>
      } @else {
        <div class="status ok" role="status">
          <mat-icon>verified</mat-icon>
          <span>Calendrier validé jusqu'au <strong>{{ long(cal.validatedUntil!) }}</strong>
            @if (cal.validatedAt) { (le {{ long(cal.validatedAt.slice(0, 10)) }})}.
            Les semaines validées restent modifiables, mais des congés et heures sup peuvent déjà y être posés.</span>
        </div>
      }
    }

    @if (marked.hasValue()) {
      <div class="months">
        @for (month of calendar().months; track month.label) {
          <section class="month">
            <div class="month-head">
              <h3>{{ month.label }}</h3>
              @if (isValidated(month.last)) {
                <span class="validated" title="Mois validé"><mat-icon>check_circle</mat-icon>Validé</span>
              } @else if (month.last <= maxValidation()) {
                <button type="button" class="validate-here" [disabled]="validating()" (click)="validate(month.last)"
                        title="Cliquer pour valider le calendrier jusqu’au {{ long(month.last) }}">À valider</button>
              }
            </div>
            <div class="weekdays">
              @for (d of weekdayNames; track $index) {
                <span>{{ d }}</span>
              }
            </div>
            @for (week of month.weeks; track week.monday) {
              <button
                type="button"
                class="week"
                [class.holiday]="isMarked(week.monday)"
                [class.anchor]="anchor() === week.monday"
                [disabled]="!editable(week.monday)"
                [attr.aria-pressed]="isMarked(week.monday)"
                [attr.title]="title(week.monday)"
                (click)="toggle(week.monday, $event.shiftKey)"
              >
                @for (d of week.days; track d.date) {
                  <span class="day" [class.out]="!d.inMonth" [class.today]="d.date === today()">{{ d.day }}</span>
                }
              </button>
            }
          </section>
        }
      </div>
    } @else if (marked.error()) {
      <p class="error">Impossible de charger les semaines de vacances.</p>
    }
  `,
  styles: `
    :host { display: block; padding-top: 12px; }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 24px; margin-bottom: 16px; }
    .info { color: var(--mat-sys-on-surface-variant); margin: 0; max-width: 70ch; }
    kbd { font: inherit; font-size: 0.85em; padding: 0 4px; border: 1px solid var(--mat-sys-outline-variant); border-radius: 4px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .swatch { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface); }
    .swatch.holiday { background: var(--mat-sys-primary-container); border-color: var(--mat-sys-primary); }
    .swatch.locked { background: var(--mat-sys-surface-container-high); opacity: 0.6; }
    .error { color: var(--mat-sys-error); }
    .status { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; padding: 8px 8px 8px 14px; border-radius: 12px;
      font: var(--mat-sys-body-medium); }
    .status span { flex: 1; }
    .status.late { background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container); }
    .status.late button { background: var(--mat-sys-error); color: var(--mat-sys-on-error); }
    .status.ok { background: var(--mat-sys-surface-container); color: var(--mat-sys-on-surface-variant); padding: 10px 14px; }
    .status.ok mat-icon { color: var(--mat-sys-primary); }
    .month-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 6px 4px; min-height: 24px; }
    .validated { display: inline-flex; align-items: center; gap: 2px; font: var(--mat-sys-label-small); color: var(--mat-sys-primary); }
    .validated mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .validate-here { border: 0; background: none; padding: 2px 6px; border-radius: 6px; cursor: pointer;
      font: var(--mat-sys-label-small); color: var(--mat-sys-error); white-space: nowrap; }
    .validate-here:hover { background: var(--mat-sys-surface-container-high); text-decoration: underline; }

    .months { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
    .month { border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; padding: 10px 10px 8px; }
    h3 { margin: 0; font: var(--mat-sys-title-small); white-space: nowrap; }
    h3::first-letter { text-transform: uppercase; }
    .weekdays, .week { display: grid; grid-template-columns: repeat(7, 1fr); }
    .weekdays span { text-align: center; font: var(--mat-sys-label-small); color: var(--mat-sys-on-surface-variant); padding-bottom: 2px; }
    .week {
      width: 100%; margin: 1px 0; padding: 3px 0; border: 0; border-radius: 8px; background: none;
      font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface); cursor: pointer;
    }
    .week:hover:not(:disabled) { background: var(--mat-sys-surface-container-high); }
    .week:focus-visible { outline: 2px solid var(--mat-sys-primary); outline-offset: -2px; }
    .week.holiday { background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container); font-weight: 600; }
    .week.holiday:hover:not(:disabled) { filter: brightness(0.95); }
    .week.anchor { box-shadow: inset 0 0 0 1px var(--mat-sys-primary); }
    .week:disabled { cursor: default; opacity: 0.4; }
    .day { text-align: center; line-height: 22px; }
    .day.out { opacity: 0.45; }
    .day.today { text-decoration: underline; }
  `,
})
export class SchoolHolidaysAdmin {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  protected readonly holidays = inject(HolidayCalendarStore);

  protected readonly today = liveToday();
  protected readonly calendar = computed(() => holidayMonths(this.today(), WEEKS));
  protected readonly weekdayNames = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  protected readonly marked = resource({ loader: () => this.api.invoke(getSchoolHolidayWeeks) });
  /** Copie locale, mise à jour tout de suite au clic (le serveur suit). */
  private readonly markedSet = linkedSignal(() => new Set(this.marked.hasValue() ? this.marked.value() : []));
  protected readonly count = computed(() => [...this.markedSet()].filter((m) => this.editable(m)).length);
  /** Dernière semaine cliquée, point de départ d'un Maj + clic. */
  protected readonly anchor = signal<string | null>(null);
  protected readonly validating = signal(false);
  /** Le serveur refuse de valider plus d'un an à l'avance. */
  protected readonly maxValidation = computed(() => {
    const d = parse(this.today());
    return toIsoDate(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()));
  });
  protected readonly suggested = computed(() => {
    const cal = this.holidays.calendar();
    return cal ? suggestedValidation(cal) : this.today();
  });

  protected long(date: string): string {
    return longDate(date);
  }

  /** Jour couvert par la validation du calendrier. */
  protected isValidated(date: string): boolean {
    const until = this.holidays.calendar()?.validatedUntil;
    return !!until && date <= until;
  }

  protected async validate(until: string): Promise<void> {
    const ok = await this.confirm({
      title: 'Valider le calendrier des vacances',
      message: `Valider les semaines de vacances scolaires jusqu'au ${longDate(until)} ? Vérifiez-les avant : la date validée ne pourra plus reculer.`,
      confirmLabel: 'Valider',
    });
    if (!ok) return;
    this.validating.set(true);
    try {
      await this.holidays.validate(until);
      this.snack.open(`Calendrier validé jusqu'au ${longDate(until)}`, 'OK', { duration: 3000 });
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
    }
    this.validating.set(false);
  }

  private async confirm(data: ConfirmDialogData): Promise<boolean> {
    return !!(await firstValueFrom(this.dialog.open(ConfirmDialog, { data }).afterClosed()));
  }

  /** Absences et heures sup (en attente / acceptées, tout le monde) posées sur ces semaines. */
  private async requestsOn(mondays: string[]): Promise<{ absences: number; overtimes: number }> {
    // le planning se lit par tranches de 8 semaines au plus (62 jours max par appel)
    const absences = new Set<number>();
    const overtimes = new Set<number>();
    for (let i = 0; i < mondays.length; i += 8) {
      const chunk = mondays.slice(i, i + 8);
      const planning = await this.api.invoke(getPlanning, { from: chunk[0], to: addDays(chunk.at(-1)!, 7) });
      const inChunk = (start: string, end: string) => chunk.some((m) => start < addDays(m, 7) && end >= m);
      planning.absences.filter((a) => inChunk(a.startDate, a.endDate)).forEach((a) => absences.add(a.id));
      planning.overtimes.filter((o) => inChunk(o.date, o.date)).forEach((o) => overtimes.add(o.id));
    }
    return { absences: absences.size, overtimes: overtimes.size };
  }

  /** Une semaine déjà validée reste modifiable, après confirmation (spec §1). */
  private async confirmValidated(mondays: string[], mark: boolean): Promise<boolean> {
    const locked = mondays.filter((m) => this.isValidated(m));
    if (!locked.length) return true;
    let counts = '';
    try {
      const { absences, overtimes } = await this.requestsOn(locked);
      const parts = [
        absences ? `${absences} absence${absences > 1 ? 's' : ''}` : '',
        overtimes ? `${overtimes} demande${overtimes > 1 ? 's' : ''} d'heures sup` : '',
      ].filter(Boolean);
      counts = parts.length
        ? ` ${parts.join(' et ')} y ${absences + overtimes > 1 ? 'sont' : 'est'} déjà posée${absences + overtimes > 1 ? 's' : ''} : ${absences + overtimes > 1 ? 'leurs' : 'ses'} heures ont été calculées sur les horaires actuels et ne seront pas recalculées.`
        : ' Aucune absence ni heure sup n\'y est posée pour l\'instant.';
    } catch {
      counts = ' Des absences ou heures sup peuvent déjà y être posées.';
    }
    const what = locked.length > 1 ? `Ces ${locked.length} semaines sont` : 'Cette semaine est';
    return this.confirm({
      title: 'Semaine déjà validée',
      message: `${what} dans le calendrier validé.${counts} ${mark ? 'La passer en vacances scolaires' : 'La repasser en semaine classique'} quand même ?`,
      confirmLabel: 'Modifier quand même',
    });
  }

  protected isMarked(monday: string): boolean {
    return this.markedSet().has(monday);
  }

  protected editable(monday: string): boolean {
    return monday >= this.calendar().firstMonday && monday <= this.calendar().lastMonday;
  }

  protected title(monday: string): string {
    const range = `Semaine du ${SHORT.format(parse(monday))} au ${SHORT.format(parse(addDays(monday, 6)))}`;
    if (!this.editable(monday)) return `${range} — plus modifiable`;
    return `${range} — ${this.isMarked(monday) ? 'vacances scolaires' : 'classique'}${this.isValidated(monday) ? ' (validée)' : ''}`;
  }

  protected async toggle(monday: string, range: boolean): Promise<void> {
    const mark = !this.isMarked(monday);
    const from = range ? this.anchor() : null;
    const mondays: string[] = [];
    if (from) {
      const [a, b] = from < monday ? [from, monday] : [monday, from];
      for (let m = a; m <= b; m = addDays(m, 7)) if (this.editable(m) && this.isMarked(m) !== mark) mondays.push(m);
    } else {
      mondays.push(monday);
    }
    this.anchor.set(monday);
    if (!mondays.length) return;
    if (!(await this.confirmValidated(mondays, mark))) return;

    this.markedSet.update((set) => {
      const next = new Set(set);
      for (const m of mondays) if (mark) next.add(m); else next.delete(m);
      return next;
    });
    try {
      for (const weekStart of mondays) {
        await this.api.invoke(mark ? markSchoolHolidayWeek : unmarkSchoolHolidayWeek, { weekStart });
      }
      const n = mondays.length;
      this.snack.open(
        mark
          ? `${n > 1 ? `${n} semaines marquées` : 'Semaine marquée'} « vacances scolaires »`
          : `${n > 1 ? `${n} semaines redevenues classiques` : 'Semaine redevenue classique'}`,
        'OK',
        { duration: 3000 },
      );
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
      this.marked.reload();
    }
  }
}
