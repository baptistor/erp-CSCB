import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import type {
  CalendarOptions,
  DateSelectInfo,
  EventClickInfo,
  EventDisplayInfo,
  EventInput,
  EventSourceFuncInfo,
} from 'fullcalendar';
import frLocale from 'fullcalendar/locales/fr';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api/api';
import {
  cancelAbsence,
  createSpecialDay,
  deleteSpecialDay,
  getMyBalance,
  getPlanning,
  getUsers,
  requestAbsence,
  updateSpecialDay,
} from '../../api/functions';
import { AbsenceInput, Planning, PlanningAbsence, PlanningDay, UserSummary } from '../../api/models';
import { AuthService } from '../../core/auth/auth.service';
import { addDays, errorMessage, toIsoDate } from '../../shared/dates';
import { formatHours } from '../../shared/requests';
import { colorFor, fullName, tint } from '../../shared/user-color';
import { AbsenceDialog, AbsenceDialogData, AbsenceDialogResult } from './absence-dialog';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';
import { DayDialog, DayDialogData, DayDialogResult } from './day-dialog';
import { loadVisible, PeopleFilter, visiblePeople } from './people-filter';
import { DaysSelection, RangeSelection, WeekGrid } from './week-grid';
import { clipToDay, toMinutes, toTime, weekDays } from './week-grid-layout';

type View = 'week' | 'month';
type Mode = 'read' | 'edit';
type EditAction = 'absence' | 'hours';

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

function parseIso(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Planning (spec §1, §3) : choix des emplois du temps affichés (par défaut le sien), vue Semaine (grille horaire maison,
 * une colonne par personne) ou Mois (FullCalendar), modes Lecture / Édition. Depuis le planning, chacun n'agit que sur
 * son propre emploi du temps : poser une absence (sélection → fenêtre) ou modifier ses horaires (clic / sélection →
 * fenêtre).
 */
@Component({
  selector: 'app-planning-calendar',
  imports: [FullCalendarModule, MatButtonModule, MatButtonToggleModule, MatIconModule, PeopleFilter, WeekGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-people-filter [users]="users()" [meId]="meId()" [selected]="selected()"
                       (selectedChange)="selected.set($event)" />

    <div class="toolbar">
      <mat-button-toggle-group [value]="mode()" (change)="mode.set($event.value)" aria-label="Mode du planning">
        <mat-button-toggle value="read"><mat-icon>visibility</mat-icon> Lecture</mat-button-toggle>
        <mat-button-toggle value="edit"><mat-icon>edit</mat-icon> Édition</mat-button-toggle>
      </mat-button-toggle-group>
      @if (mode() === 'edit') {
        <mat-button-toggle-group [value]="action()" (change)="action.set($event.value)" aria-label="Action">
          <mat-button-toggle value="absence">Poser une absence</mat-button-toggle>
          <mat-button-toggle value="hours">Modifier mes horaires</mat-button-toggle>
        </mat-button-toggle-group>
      }
      @if (available() != null) {
        <span class="available">Disponible pour une récup : <strong>{{ hours(available()!) }}</strong></span>
      }
    </div>
    @if (mode() === 'edit') {
      <p class="hint">
        @if (action() === 'absence') {
          Glissez la souris sur un jour pour sélectionner la plage d'absence (elle est rognée à vos horaires), ou sur la
          ligne « Toute la journée » pour des journées entières. Une fenêtre s'ouvre pour préciser le type et le motif.
          La croix d'une de vos absences (en attente ou acceptée, pas encore commencée) la supprime.
        } @else {
          Cliquez sur l'une de vos journées, ou sélectionnez une plage sur un jour, pour modifier vos horaires de ce jour
          (à partir d'aujourd'hui).
        }
      </p>
    }

    <div class="nav">
      <button mat-icon-button type="button" (click)="shift(-1)" aria-label="Précédent"><mat-icon>chevron_left</mat-icon></button>
      <button mat-icon-button type="button" (click)="shift(1)" aria-label="Suivant"><mat-icon>chevron_right</mat-icon></button>
      <button mat-stroked-button type="button" (click)="anchor.set(todayDate())">Aujourd'hui</button>
      <h2 class="title">{{ title() }}</h2>
      <mat-button-toggle-group [value]="view()" (change)="view.set($event.value)" aria-label="Vue">
        <mat-button-toggle value="week">Semaine</mat-button-toggle>
        <mat-button-toggle value="month">Mois</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    @if (view() === 'week') {
      <app-week-grid [days]="days()" [people]="people()" [planningDays]="weekDaysData()" [absences]="weekAbsences()"
                     [meId]="meId()" [today]="today" [selectable]="mode() === 'edit'" [cancellable]="mode() === 'edit'"
                     [ownDayClickable]="mode() === 'edit' && action() === 'hours'"
                     (rangeSelected)="onRange($event)" (daysSelected)="onDays($event)"
                     (ownDayClicked)="editMyDay($event)" (cancelAbsence)="cancel($event)" />
    } @else {
      <full-calendar [options]="monthOptions()" />
    }
  `,
  styles: `
    :host { display: block; }
    app-people-filter { display: block; margin-bottom: 12px; }
    .toolbar { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
    .toolbar mat-icon { margin-right: 4px; vertical-align: middle; font-size: 20px; height: 20px; width: 20px; }
    .available { font: var(--mat-sys-body-medium); }
    .hint { color: var(--mat-sys-on-surface-variant); margin: 12px 0 0; font: var(--mat-sys-body-medium); }
    .nav { display: flex; align-items: center; gap: 8px; margin: 16px 0 12px; flex-wrap: wrap; }
    .title { flex: 1; margin: 0 8px; font: var(--mat-sys-title-large); }
  `,
})
export class PlanningCalendar implements OnInit {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly calendar = viewChild(FullCalendarComponent);

  protected readonly today = toIsoDate(new Date());
  protected readonly todayDate = () => new Date();

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly meId = computed(() => this.auth.currentUser()?.id ?? null);
  /** Collaborateurs cochés (hors soi, toujours affiché), mémorisés sur le navigateur. */
  protected readonly selected = signal<ReadonlySet<number>>(new Set(loadVisible() ?? []));
  protected readonly people = computed(() => visiblePeople(this.users(), this.meId(), this.selected()));
  private readonly peopleIds = computed(() => new Set(this.people().map((p) => p.id)));

  protected readonly view = signal<View>('week');
  protected readonly anchor = signal(new Date());
  protected readonly mode = signal<Mode>('read');
  protected readonly action = signal<EditAction>('absence');
  protected readonly available = signal<number | null>(null);
  protected readonly hours = (h: number) => formatHours(h);

  protected readonly days = computed(() => weekDays(this.anchor()));

  protected readonly title = computed(() => {
    if (this.view() === 'month') return MONTH_TITLE.format(this.anchor());
    const days = this.days();
    const first = parseIso(days[0]);
    const last = parseIso(days[6]);
    const firstMonth = first.getMonth() === last.getMonth() ? '' : ` ${first.toLocaleDateString('fr-FR', { month: 'short' })}`;
    return `${first.getDate()}${firstMonth} – ${last.getDate()} ${MONTH_TITLE.format(last)}`;
  });

  /** Planning de la semaine affichée. */
  private readonly weekPlanning = resource({
    params: () => (this.view() === 'week' ? { from: this.days()[0], to: addDays(this.days()[6], 1) } : undefined),
    loader: ({ params }) => this.api.invoke(getPlanning, params),
  });

  /** Dernier planning chargé (semaine ou mois) : sert à connaître mes horaires pour une sélection. */
  private lastPlanning: Planning | null = null;

  protected readonly weekDaysData = computed(() =>
    (this.weekPlanning.hasValue() ? this.weekPlanning.value().days : []).filter((d) => this.peopleIds().has(d.userId)),
  );
  protected readonly weekAbsences = computed(() =>
    (this.weekPlanning.hasValue() ? this.weekPlanning.value().absences : []).filter((a) =>
      this.peopleIds().has(a.userId),
    ),
  );

  protected readonly monthOptions = computed<CalendarOptions>(() => {
    const ids = this.peopleIds();
    const edit = this.mode() === 'edit';
    const action = this.action();
    return {
      plugins: [themePlugin, dayGridPlugin, interactionPlugin],
      locale: frLocale,
      firstDay: 1,
      initialView: 'dayGridMonth',
      initialDate: this.anchor(),
      headerToolbar: false,
      height: 'auto',
      displayEventEnd: true,
      eventTimeFormat: { hour: '2-digit', minute: '2-digit' },
      events: (info: EventSourceFuncInfo) => this.loadMonth(info.start, info.end, ids, edit),
      selectable: edit,
      select: (info) => void this.onMonthSelect(info, action),
      eventClick: (info) => this.onMonthClick(info, edit && action === 'hours'),
      eventDidMount: (info) => this.addCancelButton(info),
    };
  });

  constructor() {
    // navigation en vue Mois : FullCalendar suit la date de référence
    effect(() => {
      const anchor = this.anchor();
      if (this.view() === 'month') this.calendar()?.getApi().gotoDate(anchor);
    });
    effect(() => {
      if (this.weekPlanning.hasValue()) this.lastPlanning = this.weekPlanning.value();
    });
    effect(() => {
      const error = this.weekPlanning.error();
      if (error) this.notify(errorMessage(error, 'Impossible de charger le planning'));
    });
  }

  ngOnInit(): void {
    void this.api.invoke(getUsers).then((users) => this.users.set(users));
    void this.loadBalance();
  }

  protected shift(direction: 1 | -1): void {
    const a = this.anchor();
    this.anchor.set(
      this.view() === 'week'
        ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * direction)
        : new Date(a.getFullYear(), a.getMonth() + direction, 1),
    );
  }

  // ---------- mes horaires connus (semaine / mois chargés) ----------

  private myDay(date: string): PlanningDay | undefined {
    return this.lastPlanning?.days.find((d) => d.userId === this.meId() && d.date === date);
  }

  private myWorked(date: string): { start: string; end: string } | undefined {
    const day = this.myDay(date);
    return day?.startTime && day.endTime ? { start: day.startTime, end: day.endTime } : undefined;
  }

  // ---------- poser une absence ----------

  protected onRange(selection: RangeSelection): void {
    if (this.action() === 'hours') {
      void this.editMyDay(selection.date, selection);
      return;
    }
    void this.askRangeAbsence(selection);
  }

  protected onDays(selection: DaysSelection): void {
    if (this.action() === 'hours') {
      void this.editMyDay(selection.startDate);
      return;
    }
    void this.askDaysAbsence(selection.startDate, selection.endDate);
  }

  private async askRangeAbsence(selection: RangeSelection): Promise<void> {
    if (selection.date < this.today) {
      this.notify("Une absence se pose à partir d'aujourd'hui.");
      return;
    }
    const worked = this.myWorked(selection.date);
    const clipped = clipToDay({ start: toMinutes(selection.start), end: toMinutes(selection.end) }, worked);
    if (!clipped) {
      this.notify(
        worked
          ? `La sélection doit toucher vos horaires de ce jour (${worked.start}–${worked.end}).`
          : "Ce jour n'est pas travaillé pour vous.",
      );
      return;
    }
    const start = toTime(clipped.start);
    const end = toTime(clipped.end);
    const result = await this.openAbsenceDialog({
      summary: `${LONG_DATE.format(parseIso(selection.date))} de ${start} à ${end}`,
      hours: (clipped.end - clipped.start) / 60,
      available: this.available(),
    });
    if (result) {
      await this.sendAbsence({ ...result, startDate: selection.date, startTime: start, endTime: end });
    }
  }

  private async askDaysAbsence(startDate: string, endDate: string): Promise<void> {
    if (startDate < this.today) {
      this.notify("Une absence se pose à partir d'aujourd'hui.");
      return;
    }
    let minutes = 0;
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      const worked = this.myWorked(date);
      if (worked) minutes += toMinutes(worked.end) - toMinutes(worked.start);
    }
    if (minutes === 0) {
      this.notify('Aucun jour travaillé pour vous sur cette période.');
      return;
    }
    const summary =
      startDate === endDate
        ? `${LONG_DATE.format(parseIso(startDate))} (journée entière)`
        : `du ${LONG_DATE.format(parseIso(startDate))} au ${LONG_DATE.format(parseIso(endDate))} (journées entières)`;
    const result = await this.openAbsenceDialog({
      summary,
      hours: Math.round(minutes / 15) / 4,
      available: this.available(),
    });
    if (result) await this.sendAbsence({ ...result, startDate, endDate });
  }

  private openAbsenceDialog(data: AbsenceDialogData): Promise<AbsenceDialogResult | undefined> {
    return firstValueFrom(
      this.dialog.open<AbsenceDialog, AbsenceDialogData, AbsenceDialogResult>(AbsenceDialog, { data }).afterClosed(),
    );
  }

  private async sendAbsence(body: AbsenceInput): Promise<void> {
    try {
      const created = await this.api.invoke(requestAbsence, { body });
      this.notify(`Absence de ${formatHours(created.hours)} demandée — en attente de validation`);
    } catch (error) {
      this.notify(errorMessage(error));
    }
    this.refresh();
  }

  /** Suppression d'une de mes absences ; confirmation si elle est déjà acceptée (spec §3). */
  protected async cancel(id: number): Promise<void> {
    const absence = this.findAbsence(id);
    if (absence?.status === 'APPROVED') {
      const confirmed = await firstValueFrom(
        this.dialog
          .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
            data: {
              title: 'Supprimer une absence acceptée',
              message:
                `Supprimer votre absence acceptée ${this.describe(absence)} ? ` +
                'Si c’est une récupération, ses heures seront rendues à votre solde.',
              confirmLabel: 'Supprimer',
            },
          })
          .afterClosed(),
      );
      if (!confirmed) return;
    }
    try {
      await this.api.invoke(cancelAbsence, { id });
      this.notify('Absence supprimée');
    } catch (error) {
      this.notify(errorMessage(error));
    }
    this.refresh();
  }

  private findAbsence(id: number): PlanningAbsence | undefined {
    return this.lastPlanning?.absences.find((a) => a.id === id);
  }

  private describe(a: PlanningAbsence): string {
    const date = (iso: string) => iso.split('-').reverse().join('/');
    if (a.startTime) return `du ${date(a.startDate)} de ${a.startTime} à ${a.endTime}`;
    return a.startDate === a.endDate ? `du ${date(a.startDate)}` : `du ${date(a.startDate)} au ${date(a.endDate)}`;
  }

  // ---------- modifier mes horaires (uniquement les miens) ----------

  protected async editMyDay(date: string, selection?: RangeSelection): Promise<void> {
    const me = this.auth.currentUser();
    if (!me) return;
    if (date < this.today) {
      this.notify('Les jours passés ne sont plus modifiables.');
      return;
    }
    const day = this.myDay(date);
    const result = await firstValueFrom(
      this.dialog
        .open<DayDialog, DayDialogData, DayDialogResult>(DayDialog, {
          data: {
            users: this.users().filter((u) => u.id === me.id),
            lockUser: true,
            initial: {
              userId: me.id,
              date,
              startTime: selection?.start ?? day?.startTime ?? (day ? null : '09:00'),
              endTime: selection?.end ?? day?.endTime ?? (day ? null : '16:00'),
            },
            existing: day ? { specialDayId: day.specialDayId ?? null } : undefined,
          },
        })
        .afterClosed(),
    );
    if (!result) return;
    const specialId = day?.specialDayId;
    try {
      if (result.action === 'reset' && specialId != null) {
        await this.api.invoke(deleteSpecialDay, { id: specialId });
        this.notify('Horaires habituels rétablis');
      } else if (result.action === 'save') {
        await (specialId != null
          ? this.api.invoke(updateSpecialDay, { id: specialId, body: result.input })
          : this.api.invoke(createSpecialDay, { body: result.input }));
        this.notify('Horaires du jour modifiés');
      }
    } catch (error) {
      this.notify(errorMessage(error));
    }
    this.refresh();
  }

  // ---------- vue Mois (FullCalendar) ----------

  private async loadMonth(start: Date, end: Date, ids: Set<number>, edit: boolean): Promise<EventInput[]> {
    try {
      const planning = await this.api.invoke(getPlanning, { from: toIsoDate(start), to: toIsoDate(end) });
      this.lastPlanning = planning;
      const label = (userId: number) => {
        const user = this.users().find((u) => u.id === userId);
        return user ? fullName(user) : `#${userId}`;
      };
      const days: EventInput[] = planning.days
        .filter((d) => ids.has(d.userId) && d.startTime && d.endTime)
        .map((d) => ({
          title: label(d.userId),
          start: `${d.date}T${d.startTime}`,
          end: `${d.date}T${d.endTime}`,
          color: colorFor(d.userId),
          extendedProps: { kind: 'day', day: d },
        }));
      const absences: EventInput[] = planning.absences
        .filter((a) => ids.has(a.userId))
        .map((a) => this.monthAbsence(a, label(a.userId), edit));
      return [...absences, ...days];
    } catch (error) {
      this.notify(errorMessage(error, 'Impossible de charger le planning'));
      return [];
    }
  }

  private monthAbsence(a: PlanningAbsence, name: string, edit: boolean): EventInput {
    const pending = a.status === 'PENDING';
    const timed = a.startTime && a.endTime;
    return {
      title: pending ? 'Mon absence (en attente)' : `${name} — absent·e`,
      start: timed ? `${a.startDate}T${a.startTime}` : a.startDate,
      end: timed ? `${a.startDate}T${a.endTime}` : addDays(a.endDate, 1),
      allDay: !timed,
      // journée(s) entière(s) : neutre (gris) et barrée ; plage horaire : teinte de l'employé
      color: timed ? tint(colorFor(a.userId)) : '#5f6368',
      contrastColor: timed ? '#202124' : '#ffffff',
      className: [pending ? 'pl-absence-pending' : '', timed ? '' : 'pl-absence-day'].join(' ').trim(),
      extendedProps: {
        kind: 'absence',
        absence: a,
        cancellable: edit && a.userId === this.meId() && a.startDate >= this.today,
      },
    };
  }

  private async onMonthSelect(info: DateSelectInfo, action: EditAction): Promise<void> {
    this.calendar()?.getApi().unselect();
    const start = toIsoDate(info.start);
    if (action === 'hours') await this.editMyDay(start);
    else await this.askDaysAbsence(start, addDays(toIsoDate(info.end), -1));
  }

  private onMonthClick(info: EventClickInfo, hoursMode: boolean): void {
    const props = info.event.extendedProps as { kind?: string; day?: PlanningDay };
    if (hoursMode && props.kind === 'day' && props.day && props.day.userId === this.meId()) {
      void this.editMyDay(props.day.date);
    }
  }

  /** Croix « supprimer » sur mes absences pas encore commencées (vue Mois, mode Édition). */
  private addCancelButton(info: EventDisplayInfo & { el: HTMLElement }): void {
    const props = info.event.extendedProps as { kind?: string; absence?: PlanningAbsence; cancellable?: boolean };
    if (props.kind !== 'absence' || !props.cancellable || !props.absence) return;
    const id = props.absence.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pl-cancel';
    button.textContent = '×';
    button.title = 'Supprimer cette absence';
    button.setAttribute('aria-label', 'Supprimer cette absence');
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.cancel(id);
    });
    info.el.appendChild(button);
  }

  // ---------- commun ----------

  private refresh(): void {
    this.weekPlanning.reload();
    this.calendar()?.getApi().refetchEvents();
    void this.loadBalance();
  }

  private async loadBalance(): Promise<void> {
    try {
      this.available.set((await this.api.invoke(getMyBalance)).available);
    } catch {
      this.available.set(null);
    }
  }

  private notify(message: string): void {
    this.snack.open(message, 'OK', { duration: 5000 });
  }
}
