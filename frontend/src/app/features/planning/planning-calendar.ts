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
import { MatTooltipModule } from '@angular/material/tooltip';
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
  requestAbsence,
  updateSpecialDay,
} from '../../api/functions';
import { AbsenceInput, Planning, PlanningAbsence, PlanningDay } from '../../api/models';
import { addDays, errorMessage, toIsoDate } from '../../shared/dates';
import { formatHours } from '../../shared/requests';
import { defaultExtra, mergeRanges, outsideTypical, WorkedRange, workedMinutes } from '../../shared/schedule-rules';
import { colorFor, fullName, tint } from '../../shared/user-color';
import { AbsenceDialog, AbsenceDialogData, AbsenceDialogResult } from './absence-dialog';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';
import { DayDialog, DayDialogData, DayDialogResult } from './day-dialog';
import { PeopleStore } from './people-store';
import { DaysSelection, OwnDayClick, RangeSelection, WeekGrid } from './week-grid';
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
 * Planning (spec §1, §3) : emplois du temps choisis dans le menu de gauche (par défaut le sien), vue Semaine (grille horaire maison,
 * une colonne par personne) ou Mois (FullCalendar), modes Lecture / Édition. Depuis le planning, chacun n'agit que sur
 * son propre emploi du temps : poser une absence (sélection → fenêtre) ou ajouter des heures en dehors de sa
 * journée type (sélection → fenêtre).
 */
@Component({
  selector: 'app-planning-calendar',
  imports: [FullCalendarModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTooltipModule, WeekGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.editing]': "mode() === 'edit'" },
  template: `
    <div class="nav">
      <button mat-icon-button type="button" (click)="shift(-1)" aria-label="Précédent"><mat-icon>chevron_left</mat-icon></button>
      <button mat-icon-button type="button" (click)="shift(1)" aria-label="Suivant"><mat-icon>chevron_right</mat-icon></button>
      <button mat-stroked-button type="button" (click)="anchor.set(todayDate())">Aujourd'hui</button>
      <h2 class="title">
        {{ title() }}
        @if (holidayWeek()) {
          <span class="holiday">Vacances scolaires</span>
        }
      </h2>
      <mat-button-toggle-group class="modes" [value]="mode()" (change)="mode.set($event.value)"
                               aria-label="Mode du planning" hideSingleSelectionIndicator>
        <mat-button-toggle value="read" matTooltip="Consulter le planning"><mat-icon>visibility</mat-icon> Lecture</mat-button-toggle>
        <mat-button-toggle value="edit" matTooltip="Poser une absence ou ajouter des heures"><mat-icon>edit</mat-icon> Modifier</mat-button-toggle>
      </mat-button-toggle-group>
      <mat-button-toggle-group hideSingleSelectionIndicator [value]="view()" (change)="view.set($event.value)" aria-label="Vue">
        <mat-button-toggle value="week">Semaine</mat-button-toggle>
        <mat-button-toggle value="month">Mois</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    @if (mode() === 'edit') {
      <div class="top">
        <mat-button-toggle-group [value]="action()" (change)="action.set($event.value)" aria-label="Action">
          <mat-button-toggle value="absence">Poser une absence</mat-button-toggle>
          <mat-button-toggle value="hours">Ajouter des heures</mat-button-toggle>
        </mat-button-toggle-group>
        @if (available() != null) {
          <span class="available">Disponible pour une récup : <strong>{{ hours(available()!) }}</strong></span>
        }
      </div>
      <p class="hint">
        @if (action() === 'absence') {
          Glissez la souris sur un jour pour sélectionner la plage d'absence (elle est rognée à vos horaires), ou sur la
          ligne « Toute la journée » pour des journées entières. Une fenêtre s'ouvre pour préciser le type et le motif.
          La croix d'une de vos absences (en attente ou acceptée, pas encore commencée) la supprime.
        } @else {
          Glissez la souris sur un jour (à partir d'aujourd'hui), en dehors de votre journée type et de la pause de
          midi, pour y ajouter des heures. Cliquez sur des heures ajoutées pour les modifier ou les retirer.
        }
      </p>
    }

    @if (view() === 'week') {
      <app-week-grid [days]="days()" [people]="people()" [planningDays]="weekDaysData()" [absences]="weekAbsences()"
                     [meId]="meId()" [today]="today" [selectable]="mode() === 'edit'" [cancellable]="mode() === 'edit'"
                     [ownDayClickable]="mode() === 'edit' && action() === 'hours'"
                     (rangeSelected)="onRange($event)" (daysSelected)="onDays($event)"
                     (ownDayClicked)="onOwnDay($event)" (cancelAbsence)="cancel($event)" />
    } @else {
      <full-calendar [options]="monthOptions()" />
    }
  `,
  styles: `
    :host { display: block; }
    /* mode Édition : fond ambre clair sur toute la zone, grille comprise */
    :host { padding: 0 12px 12px; border-radius: 12px; transition: background-color 0.2s; }
    :host(.editing) { background: #fff4d6; --planning-bg: #fffaf0; }
    .top { display: flex; gap: 8px 16px; flex-wrap: wrap; align-items: center; padding-bottom: 4px; }
    .modes .mat-button-toggle-checked { font-weight: 600; }
    .modes mat-icon { font-size: 22px; height: 22px; width: 22px; margin-right: 4px; vertical-align: middle; }
    .available { font: var(--mat-sys-body-medium); }
    .hint { color: var(--mat-sys-on-surface-variant); margin: 0 0 8px; font: var(--mat-sys-body-medium); }
    .nav { display: flex; align-items: center; gap: 8px; padding: 6px 0; flex-wrap: wrap; }
    .title { flex: 1; margin: 0 8px; font: var(--mat-sys-title-large); }
    .holiday { margin-left: 8px; padding: 3px 10px; border-radius: 12px; vertical-align: middle;
      font: var(--mat-sys-label-medium); color: #00504a; background: #b2dfdb; }
  `,
})
export class PlanningCalendar implements OnInit {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly store = inject(PeopleStore);
  private readonly calendar = viewChild(FullCalendarComponent);

  protected readonly today = toIsoDate(new Date());
  protected readonly todayDate = () => new Date();

  private readonly users = this.store.users;
  protected readonly meId = this.store.meId;
  /** Emplois du temps affichés, choisis dans le menu de gauche. */
  protected readonly people = this.store.people;
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

  protected readonly holidayWeek = computed(
    () =>
      this.view() === 'week' &&
      this.weekPlanning.hasValue() &&
      this.weekPlanning.value().holidayWeeks.includes(this.days()[0]),
  );
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
      dayMaxEvents: 6,
      moreLinkText: (n: number) => `+ ${n} autre${n > 1 ? 's' : ''}`,
      // absences, puis mon emploi du temps, puis les autres
      eventOrder: 'rank,start,title',
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
    void this.store.load().catch((error) => this.notify(errorMessage(error, 'Impossible de charger les employés')));
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

  private myDays(date: string): PlanningDay[] {
    return this.lastPlanning?.days.filter((d) => d.userId === this.meId() && d.date === date) ?? [];
  }

  private myTypical(date: string): WorkedRange[] {
    return this.myDays(date)
      .filter((d) => d.specialDayId == null)
      .map((d) => ({ start: d.startTime, end: d.endTime }));
  }

  private myWorked(date: string): WorkedRange[] {
    return mergeRanges(this.myDays(date).map((d) => ({ start: d.startTime, end: d.endTime })));
  }

  // ---------- poser une absence ----------

  protected onRange(selection: RangeSelection): void {
    if (this.action() === 'hours') {
      void this.addHours(selection.date, selection);
      return;
    }
    void this.askRangeAbsence(selection);
  }

  protected onDays(selection: DaysSelection): void {
    if (this.action() === 'hours') {
      void this.addHours(selection.startDate);
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
    // rognée à mes horaires ; elle peut enjamber la pause ou une coupure (non comptées)
    const wanted = { start: toMinutes(selection.start), end: toMinutes(selection.end) };
    const clipped = worked
      .map((range) => clipToDay(wanted, range))
      .filter((range) => range !== null);
    if (!clipped.length) {
      this.notify(
        worked.length
          ? `La sélection doit toucher vos horaires de ce jour (${worked.map((r) => `${r.start}–${r.end}`).join(', ')}).`
          : "Ce jour n'est pas travaillé pour vous.",
      );
      return;
    }
    const start = toTime(Math.min(...clipped.map((r) => r.start)));
    const end = toTime(Math.max(...clipped.map((r) => r.end)));
    const result = await this.openAbsenceDialog({
      summary: `${LONG_DATE.format(parseIso(selection.date))} de ${start} à ${end}`,
      hours: Math.round(workedMinutes(worked, start, end) / 15) / 4,
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
      for (const range of this.myWorked(date)) minutes += toMinutes(range.end) - toMinutes(range.start);
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

  // ---------- ajouter des heures (uniquement à mon emploi du temps) ----------

  protected onOwnDay({ date, extraId }: OwnDayClick): void {
    if (extraId == null) {
      this.notify('La journée type ne se modifie pas ici : glissez en dehors pour ajouter des heures.');
      return;
    }
    void this.editExtra(date, extraId);
  }

  private async addHours(date: string, selection?: RangeSelection): Promise<void> {
    if (!this.canChange(date)) return;
    const typical = this.myTypical(date);
    const range = selection ? outsideTypical(selection, typical) : defaultExtra(typical);
    if (!range) {
      this.notify('Sélectionnez une plage en dehors de votre journée type et de la pause de midi (12:30–13:30).');
      return;
    }
    const result = await this.openDayDialog({ date, startTime: range.start, endTime: range.end });
    if (result?.action === 'save') {
      await this.change(() => this.api.invoke(createSpecialDay, { body: result.input }), 'Heures ajoutées');
    }
  }

  private async editExtra(date: string, id: number): Promise<void> {
    const extra = this.myDays(date).find((d) => d.specialDayId === id);
    if (!extra || !this.canChange(date)) return;
    const result = await this.openDayDialog({ date, startTime: extra.startTime, endTime: extra.endTime }, id);
    if (result?.action === 'save') {
      await this.change(() => this.api.invoke(updateSpecialDay, { id, body: result.input }), 'Heures ajoutées modifiées');
    } else if (result?.action === 'remove') {
      await this.change(() => this.api.invoke(deleteSpecialDay, { id }), 'Heures ajoutées retirées');
    }
  }

  private canChange(date: string): boolean {
    if (date < this.today) this.notify('Les jours passés ne sont plus modifiables.');
    return date >= this.today;
  }

  private openDayDialog(initial: DayDialogData['initial'], extraId?: number): Promise<DayDialogResult | undefined> {
    const user = this.users().find((u) => u.id === this.meId());
    if (!user) return Promise.resolve(undefined);
    const data: DayDialogData = {
      user,
      initial,
      existing: extraId != null,
      lockDate: true,
      dayOf: (date) => ({
        typical: this.myTypical(date),
        others: this.myDays(date)
          .filter((d) => d.specialDayId != null && d.specialDayId !== extraId)
          .map((d) => ({ start: d.startTime, end: d.endTime })),
      }),
    };
    return firstValueFrom(this.dialog.open<DayDialog, DayDialogData, DayDialogResult>(DayDialog, { data }).afterClosed());
  }

  private async change(call: () => Promise<unknown>, success: string): Promise<void> {
    try {
      await call();
      this.notify(success);
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
      // une ligne par personne et par jour : du premier début à la dernière fin
      const byDay = new Map<string, PlanningDay[]>();
      for (const d of planning.days.filter((day) => ids.has(day.userId))) {
        const key = `${d.userId}|${d.date}`;
        byDay.set(key, [...(byDay.get(key) ?? []), d]);
      }
      const days: EventInput[] = [...byDay.values()].map((parts) => ({
        title: label(parts[0].userId),
        start: `${parts[0].date}T${parts.map((d) => d.startTime).sort()[0]}`,
        end: `${parts[0].date}T${parts.map((d) => d.endTime).sort().at(-1)}`,
        color: colorFor(parts[0].userId),
        extendedProps: { kind: 'day', parts, rank: parts[0].userId === this.meId() ? 2 : 3 },
      }));
      const absences: EventInput[] = planning.absences
        .filter((a) => ids.has(a.userId))
        .map((a) => this.monthAbsence(a, label(a.userId), edit));
      const holidays: EventInput[] = planning.holidayWeeks.map((monday) => ({
        title: 'Vacances scolaires',
        start: monday,
        end: addDays(monday, 7),
        allDay: true,
        color: '#b2dfdb',
        contrastColor: '#00504a',
        extendedProps: { kind: 'holiday', rank: 0 },
      }));
      return [...holidays, ...absences, ...days];
    } catch (error) {
      this.notify(errorMessage(error, 'Impossible de charger le planning'));
      return [];
    }
  }

  private monthAbsence(a: PlanningAbsence, name: string, edit: boolean): EventInput {
    const pending = a.status === 'PENDING';
    const timed = a.startTime && a.endTime;
    return {
      title: `${name} — ${pending ? 'absence en attente' : 'absent·e'}`,
      start: timed ? `${a.startDate}T${a.startTime}` : a.startDate,
      end: timed ? `${a.startDate}T${a.endTime}` : addDays(a.endDate, 1),
      allDay: !timed,
      // journée(s) entière(s) : neutre (gris) et barrée ; plage horaire : teinte de l'employé
      color: timed ? tint(colorFor(a.userId)) : '#5f6368',
      contrastColor: timed ? '#202124' : '#ffffff',
      className: [pending ? 'pl-absence-pending' : '', timed ? '' : 'pl-absence-day'].join(' ').trim(),
      extendedProps: {
        kind: 'absence',
        rank: 1,
        absence: a,
        cancellable: edit && a.userId === this.meId() && a.startDate >= this.today,
      },
    };
  }

  private async onMonthSelect(info: DateSelectInfo, action: EditAction): Promise<void> {
    this.calendar()?.getApi().unselect();
    const start = toIsoDate(info.start);
    if (action === 'hours') await this.addHours(start);
    else await this.askDaysAbsence(start, addDays(toIsoDate(info.end), -1));
  }

  private onMonthClick(info: EventClickInfo, hoursMode: boolean): void {
    const props = info.event.extendedProps as { kind?: string; parts?: PlanningDay[] };
    if (hoursMode && props.parts && props.parts[0].userId === this.meId()) {
      const extras = props.parts.filter((d) => d.specialDayId != null);
      if (extras.length > 1) this.notify('Plusieurs plages ajoutées ce jour : modifiez-les en vue Semaine.');
      else this.onOwnDay({ date: props.parts[0].date, extraId: extras[0]?.specialDayId ?? null });
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
