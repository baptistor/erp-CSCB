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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import type {
  CalendarOptions,
  EventInput,
  EventSourceFuncInfo,
} from 'fullcalendar';
import frLocale from 'fullcalendar/locales/fr';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api/api';
import {
  adminCancelOvertime,
  adminDeclareOvertime,
  cancelAbsence,
  cancelOvertime,
  declareOvertime,
  getMyBalance,
  getPlanning,
  requestAbsence,
} from '../../api/functions';
import { AbsenceInput, Planning, PlanningAbsence, PlanningDay, PlanningOvertime } from '../../api/models';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';
import { addDays, errorMessage, liveToday, toIsoDate } from '../../shared/dates';
import { formatHours } from '../../shared/requests';
import { colorFor, fullName, OVERTIME_COLOR } from '../../shared/user-color';
import { AbsenceDialog, AbsenceDialogData, AbsenceDialogResult } from './absence-dialog';
import { Draft, draftAt, draftError, draftFromSelection, draftHours, MyDay } from './draft';
import { OvertimeDialog, OvertimeDialogData } from './overtime-dialog';
import { PeopleStore } from './people-store';
import { HolidayWarningBanner } from '../../shared/holiday-warning-banner';
import { DaysSelection, GridPick, WeekGrid } from './week-grid';
import { toMinutes, toTime, weekDays } from './week-grid-layout';

type View = 'week' | 'month';

/** Délai avant d'afficher l'aperçu d'une ligne de la vue Mois. */
const PREVIEW_DELAY_MS = 200;

/** Détail d'une ligne de la vue Mois, affiché au survol. */
interface MonthPreview {
  name: string;
  date: string;
  lines: string[];
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const ACTIVE = new Set(['PENDING', 'APPROVED']);

function parseIso(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const frDate = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Planning (spec §1, §2, §3) : emplois du temps choisis dans le menu de gauche, vue Semaine (grille horaire maison,
 * une colonne par personne) ou Mois (FullCalendar, lecture seule). Pas de mode Édition : un clic sur mes horaires fait apparaître
 * une absence à placer, un clic en dehors des heures sup à placer ; ✓ ouvre la fenêtre de confirmation et envoie la
 * demande. Chacun n'agit que sur son propre emploi du temps.
 */
@Component({
  selector: 'app-planning-calendar',
  imports: [
    FullCalendarModule,
    HolidayWarningBanner,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    WeekGrid,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-holiday-warning-banner />
    <div class="nav">
      @if (view() === 'month') {
        <button mat-icon-button type="button" (click)="shift(-1)" aria-label="Précédent"><mat-icon>chevron_left</mat-icon></button>
        <button mat-icon-button type="button" (click)="shift(1)" aria-label="Suivant"><mat-icon>chevron_right</mat-icon></button>
        <button mat-stroked-button type="button" (click)="goToday()">Aujourd'hui</button>
      }
      <h2 class="title">
        {{ title() }}
        @if (holidayWeek()) {
          <span class="holiday">Vacances scolaires</span>
        }
      </h2>
      @if (view() === 'week') {
        <button mat-stroked-button type="button" (click)="goToday()">Aujourd'hui</button>
      }
      <span class="spacer"></span>
      @if (isAdmin()) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="target">
          <mat-label>Pour</mat-label>
          <mat-select [value]="forUserId()" (valueChange)="setTarget($event)" aria-label="Poser des heures sup pour">
            <mat-option [value]="null">Moi</mat-option>
            @for (user of store.others(); track user.id) {
              <mat-option [value]="user.id">{{ name(user) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      <mat-button-toggle-group hideSingleSelectionIndicator [value]="view()" (change)="setView($event.value)" aria-label="Vue">
        <mat-button-toggle value="week">Semaine</mat-button-toggle>
        <mat-button-toggle value="month">Mois</mat-button-toggle>
      </mat-button-toggle-group>
    </div>
    @if (forUserId() != null) {
      <div class="acting" role="status">
        <mat-icon>admin_panel_settings</mat-icon>
        <span>Vous posez des <strong class="overtime">heures sup</strong> pour <strong>{{ targetName() }}</strong> :
          cliquez en dehors de sa journée type. Elles sont <strong>acceptées directement</strong>.</span>
        <button mat-button type="button" (click)="setTarget(null)">Revenir à moi</button>
      </div>
    }
    <p class="hint">
      @if (view() === 'week' && forUserId() == null) {
        <mat-icon>touch_app</mat-icon>
        Cliquez sur <strong>vos horaires</strong> pour poser une <strong>absence</strong>, ou <strong>en dehors</strong>
        pour des <strong class="overtime">heures sup</strong> ; ajustez la plage à la souris puis ✓.
        Journées entières : glissez sur « Toute la journée ».
      }
    </p>

    @if (view() === 'week') {
      <div class="week-wrap">
      <button type="button" class="week-arrow" (click)="shift(-1)" aria-label="Semaine précédente" title="Semaine précédente">
        <svg viewBox="0 0 24 64" aria-hidden="true"><path d="M18 6 L6 32 L18 58" /></svg>
      </button>
      <app-week-grid [days]="days()" [noBreak]="holidayWeek()" [people]="people()" [planningDays]="weekDaysData()" [overtimes]="weekOvertimes()"
                     [absences]="weekAbsences()" [meId]="meId()" [today]="today()"
                     [draft]="draft()" [draftError]="draftProblem()" [draftHoursText]="draftHoursText()"
                     [draftFor]="targetName()" [manageAllOvertimes]="isAdmin()"
                     (picked)="onPick($event)" (daysSelected)="onDays($event)" (overtimeClicked)="onOvertime($event)"
                     (cancelAbsence)="cancel($event)" (draftChange)="draft.set($event)"
                     (draftConfirm)="confirmDraft()" (draftCancel)="draft.set(null)" />
      <button type="button" class="week-arrow" (click)="shift(1)" aria-label="Semaine suivante" title="Semaine suivante">
        <svg viewBox="0 0 24 64" aria-hidden="true"><path d="M6 6 L18 32 L6 58" /></svg>
      </button>
      </div>
    } @else {
      <full-calendar [options]="monthOptions()" />
      @if (preview(); as pv) {
        <div class="preview" role="tooltip" [style.left.px]="pv.x" [style.top.px]="pv.y" [class.above]="pv.above">
          <strong>{{ pv.name }}</strong>
          <span class="preview-date">{{ pv.date }}</span>
          @for (line of pv.lines; track line) {
            <span>{{ line }}</span>
          }
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; padding: 0 12px 12px; }
    .hint { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small); }
    .hint mat-icon { flex: none; font-size: 18px; width: 18px; height: 18px; }
    .hint .overtime { padding: 0 4px; border-radius: 4px; background: var(--overtime); color: #0b3d02; }
    .target { width: 200px; --mat-form-field-container-height: 40px; --mat-form-field-container-vertical-padding: 8px; }
    .acting { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 4px 4px 4px 12px; border-radius: 8px;
      background: #e8f5e9; border: 1px solid #1f8a0b; font: var(--mat-sys-body-medium); }
    .acting span { flex: 1; }
    .legend { padding: 0 6px; border-radius: 4px; border: 1px solid #9aa0a6; background-color: #fff; color: #202124; }
    .preview { position: fixed; z-index: 1000; display: flex; flex-direction: column; gap: 2px; max-width: 280px;
      padding: 8px 12px; border-radius: 8px; pointer-events: none; box-shadow: var(--mat-sys-level2);
      background: var(--mat-sys-inverse-surface); color: var(--mat-sys-inverse-on-surface); font: var(--mat-sys-body-small); }
    .preview.above { transform: translateY(-100%); }
    .preview-date { opacity: 0.75; margin-bottom: 2px; }
    .preview-date::first-letter { text-transform: uppercase; }
    .legend.absent { background-image: repeating-linear-gradient(135deg, rgba(95, 99, 104, 0.4) 0 3px, transparent 3px 9px); }
    .nav { display: flex; align-items: center; gap: 8px; padding: 6px 0 4px; flex-wrap: wrap; }
    .title { margin: 0 4px 0 8px; font: var(--mat-sys-title-large); }
    .spacer { flex: 1; }
    /* vue Semaine : grandes flèches fines de part et d'autre de la grille */
    .week-wrap { display: flex; align-items: stretch; gap: 4px; }
    .week-wrap app-week-grid { flex: 1; min-width: 0; }
    .week-arrow { flex: none; width: 44px; padding: 0; border: 0; border-radius: 12px; background: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; color: var(--mat-sys-on-surface-variant);
      transition: background-color 120ms, color 120ms; }
    .week-arrow svg { width: 26px; height: 72px; fill: none; stroke: currentColor; stroke-width: 1.6;
      stroke-linecap: round; stroke-linejoin: round; }
    .week-arrow:hover { background: var(--mat-sys-surface-container-high); color: var(--mat-sys-primary); }
    .week-arrow:focus-visible { outline: 2px solid var(--mat-sys-primary); outline-offset: -2px; }
    .holiday { margin-left: 8px; padding: 3px 10px; border-radius: 12px; vertical-align: middle;
      font: var(--mat-sys-label-medium); color: #00504a; background: #b2dfdb; }
  `,
  host: { '[style.--overtime]': 'overtimeColor' },
})
export class PlanningCalendar implements OnInit {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly store = inject(PeopleStore);
  private readonly auth = inject(AuthService);
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly name = fullName;
  /** ADMIN : employé pour qui l'on pose des heures sup (null = moi). */
  protected readonly forUserId = signal<number | null>(null);
  private readonly targetId = computed(() => this.forUserId() ?? this.meId());
  protected readonly targetName = computed(() => {
    const id = this.forUserId();
    return id == null ? '' : this.nameOf(id);
  });
  private readonly calendar = viewChild(FullCalendarComponent);

  protected readonly today = liveToday();
  protected readonly overtimeColor = OVERTIME_COLOR;

  private readonly users = this.store.users;
  protected readonly meId = this.store.meId;
  /** Emplois du temps affichés, choisis dans le menu de gauche. */
  protected readonly people = this.store.people;
  private readonly peopleIds = computed(() => new Set(this.people().map((p) => p.id)));

  protected readonly view = signal<View>('week');
  protected readonly anchor = signal(new Date());
  /** Aperçu de la ligne survolée en vue Mois. */
  protected readonly preview = signal<(MonthPreview & { x: number; y: number; above: boolean }) | null>(null);
  /** Plage à placer (absence ou heures sup), avant validation. */
  protected readonly draft = signal<Draft | null>(null);
  private readonly available = signal<number | null>(null);

  /** Lundi → samedi : le centre est fermé le dimanche (spec §1). */
  protected readonly days = computed(() => weekDays(this.anchor()).slice(0, 6));

  protected readonly title = computed(() => {
    if (this.view() === 'month') return MONTH_TITLE.format(this.anchor());
    const days = this.days();
    const first = parseIso(days[0]);
    const last = parseIso(days.at(-1)!);
    const firstMonth = first.getMonth() === last.getMonth() ? '' : ` ${first.toLocaleDateString('fr-FR', { month: 'short' })}`;
    return `${first.getDate()}${firstMonth} – ${last.getDate()} ${MONTH_TITLE.format(last)}`;
  });

  /** Planning de la semaine affichée. */
  private readonly weekPlanning = resource({
    params: () => (this.view() === 'week' ? { from: this.days()[0], to: addDays(this.days().at(-1)!, 1) } : undefined),
    loader: ({ params }) => this.api.invoke(getPlanning, params),
  });
  private readonly weekValue = computed(() => (this.weekPlanning.hasValue() ? this.weekPlanning.value() : null));

  /** Dernier planning chargé (semaine ou mois) : sert à connaître mes horaires et mes demandes. */
  private lastPlanning: Planning | null = null;

  protected readonly holidayWeek = computed(
    () => this.view() === 'week' && !!this.weekValue()?.holidayWeeks.includes(this.days()[0]),
  );
  protected readonly weekDaysData = computed(() =>
    (this.weekValue()?.days ?? []).filter((d) => this.peopleIds().has(d.userId)),
  );
  protected readonly weekOvertimes = computed(() =>
    (this.weekValue()?.overtimes ?? []).filter((o) => this.peopleIds().has(o.userId)),
  );
  protected readonly weekAbsences = computed(() =>
    (this.weekValue()?.absences ?? []).filter((a) => this.peopleIds().has(a.userId)),
  );

  protected readonly draftProblem = computed(() => {
    const draft = this.draft();
    return draft ? draftError(draft, this.myDay(draft.date, this.weekValue()), this.today()) : null;
  });
  protected readonly draftHoursText = computed(() => {
    const draft = this.draft();
    return draft ? formatHours(draftHours(draft, this.myDay(draft.date, this.weekValue()))) : '';
  });

  protected readonly monthOptions = computed<CalendarOptions>(() => {
    const ids = this.peopleIds();
    return {
      plugins: [themePlugin, dayGridPlugin, interactionPlugin],
      locale: frLocale,
      firstDay: 1,
      initialView: 'dayGridMonth',
      initialDate: this.anchor(),
      headerToolbar: false,
      height: 'auto',
      dayMaxEvents: 6,
      moreLinkText: (n: number) => `+ ${n} autre${n > 1 ? 's' : ''}`,
      // lecture seule : vacances, puis moi, puis les autres par heure de début
      eventOrder: 'rank,sort,title',
      editable: false,
      selectable: false,
      events: (info: EventSourceFuncInfo) => this.loadMonth(info.start, info.end, ids),
      eventDidMount: (info) => this.attachPreview(info.el, info.event.extendedProps['preview'] as MonthPreview | undefined),
    };
  });

  constructor() {
    // navigation en vue Mois : FullCalendar suit la date de référence
    effect(() => {
      const anchor = this.anchor();
      if (this.view() === 'month') this.calendar()?.getApi().gotoDate(anchor);
    });
    effect(() => {
      const value = this.weekValue();
      if (value) this.lastPlanning = value;
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
    this.draft.set(null);
    this.preview.set(null);
    this.anchor.set(
      this.view() === 'week'
        ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * direction)
        : new Date(a.getFullYear(), a.getMonth() + direction, 1),
    );
  }

  protected goToday(): void {
    this.draft.set(null);
    this.anchor.set(new Date());
  }

  protected setView(view: View): void {
    this.preview.set(null);
    this.draft.set(null);
    this.view.set(view);
  }

  // ---------- mon emploi du temps (journée type + heures sup en attente / acceptées) ----------

  /** Emploi du temps de la personne pour qui l'on agit (moi, ou l'employé choisi par l'admin). */
  private myDay(date: string, planning: Planning | null = this.lastPlanning): MyDay {
    const who = this.targetId();
    const range = (r: { startTime: string; endTime: string }) => ({ start: toMinutes(r.startTime), end: toMinutes(r.endTime) });
    return {
      typical: (planning?.days ?? []).filter((d) => d.userId === who && d.date === date).map(range),
      overtimes: (planning?.overtimes ?? [])
        .filter((o) => o.userId === who && o.date === date && ACTIVE.has(o.status))
        .map(range),
      noBreak: !!planning?.holidayWeeks.includes(weekDays(parseIso(date))[0]),
    };
  }

  /** ADMIN : choisit pour qui poser des heures sup (null = moi) ; sa colonne est affichée. */
  protected setTarget(userId: number | null): void {
    this.draft.set(null);
    this.forUserId.set(userId === this.meId() ? null : userId);
    if (userId != null && userId !== this.meId() && !this.store.selected().has(userId)) this.store.toggle(userId, true);
  }

  // ---------- plage à placer (vue Semaine) ----------

  protected onPick(pick: GridPick): void {
    const day = this.myDay(pick.date);
    const draft = pick.click
      ? draftAt(pick.date, pick.start, day)
      : draftFromSelection(pick.date, { start: pick.start, end: pick.end }, day);
    if (this.forUserId() != null && draft?.kind === 'absence') {
      this.notify(`Pour ${this.targetName()}, seules des heures sup se posent : cliquez en dehors de sa journée type.`);
      return;
    }
    if (!draft) {
      this.notify('Rien à poser ici : choisissez une heure en dehors de la pause de midi et des autres demandes.');
      return;
    }
    this.draft.set(draft);
  }

  protected async confirmDraft(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.draftProblem()) return;
    const start = toTime(draft.start);
    const end = toTime(draft.end);
    const summary = `${LONG_DATE.format(parseIso(draft.date))} de ${start} à ${end}`;
    const hours = draftHours(draft, this.myDay(draft.date));
    if (draft.kind === 'absence') {
      const result = await this.openAbsenceDialog({ summary, hours, available: this.available() });
      if (result && (await this.sendAbsence({ ...result, startDate: draft.date, startTime: start, endTime: end }))) {
        this.draft.set(null);
      }
      return;
    }
    const forUser = this.forUserId();
    const data: OvertimeDialogData = { summary, hours, forName: forUser != null ? this.targetName() : undefined };
    const reason = await firstValueFrom(
      this.dialog.open<OvertimeDialog, OvertimeDialogData, string>(OvertimeDialog, { data }).afterClosed(),
    );
    if (!reason) return;
    const body = { date: draft.date, startTime: start, endTime: end, reason };
    try {
      if (forUser != null) {
        const created = await this.api.invoke(adminDeclareOvertime, { userId: forUser, body });
        this.notify(`${formatHours(created.hours)} d'heures sup ajoutées pour ${this.targetName()} (acceptées)`);
      } else {
        const created = await this.api.invoke(declareOvertime, { body });
        this.notify(`${formatHours(created.hours)} d'heures sup demandées — en attente de validation`);
      }
      this.draft.set(null);
    } catch (error) {
      this.notify(errorMessage(error));
    }
    this.refresh();
  }

  /** Clic sur une de mes heures sup : annuler la demande tant qu'elle est en attente. */
  protected async onOvertime(id: number): Promise<void> {
    const overtime = this.lastPlanning?.overtimes.find((o) => o.id === id);
    if (!overtime) return;
    const when = `du ${frDate(overtime.date)} de ${overtime.startTime} à ${overtime.endTime}`;
    if (overtime.userId === this.meId() && overtime.status === 'PENDING') {
      const confirmed = await this.confirm({
        title: "Annuler la demande d'heures sup",
        message: `Annuler votre demande d'heures sup ${when} ?`,
        confirmLabel: 'Annuler la demande',
      });
      if (confirmed) await this.change(() => this.api.invoke(cancelOvertime, { id }), "Demande d'heures sup annulée");
      return;
    }
    if (!this.isAdmin()) {
      this.notify('Ces heures sup sont déjà acceptées : elles ne peuvent plus être annulées.');
      return;
    }
    // admin : retirer les heures sup de n'importe qui, en attente ou acceptées
    const name = this.nameOf(overtime.userId);
    const confirmed = await this.confirm({
      title: 'Retirer des heures sup',
      message:
        `Retirer les heures sup de ${name} ${when} ?` +
        (overtime.status === 'APPROVED' ? ' Elles sont acceptées : elles seront retirées de son solde.' : ''),
      confirmLabel: 'Retirer',
    });
    if (confirmed) await this.change(() => this.api.invoke(adminCancelOvertime, { id }), 'Heures sup retirées');
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

  private nameOf(userId: number): string {
    const user = this.users().find((u) => u.id === userId);
    return user ? fullName(user) : `#${userId}`;
  }

  // ---------- absences à la journée ----------

  protected onDays(selection: DaysSelection): void {
    if (this.forUserId() != null) {
      this.notify(`Pour ${this.targetName()}, seules des heures sup se posent (pas d'absence pour autrui).`);
      return;
    }
    void this.askDaysAbsence(selection.startDate, selection.endDate);
  }

  private async askDaysAbsence(startDate: string, endDate: string): Promise<void> {
    if (startDate < this.today()) {
      this.notify("Une absence se pose à partir d'aujourd'hui.");
      return;
    }
    let minutes = 0;
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      for (const range of this.myDay(date).typical) minutes += range.end - range.start;
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

  private async sendAbsence(body: AbsenceInput): Promise<boolean> {
    let sent = false;
    try {
      const created = await this.api.invoke(requestAbsence, { body });
      this.notify(`Absence de ${formatHours(created.hours)} demandée — en attente de validation`);
      sent = true;
    } catch (error) {
      this.notify(errorMessage(error));
    }
    this.refresh();
    return sent;
  }

  /** Suppression d'une de mes absences ; confirmation si elle est déjà acceptée (spec §3). */
  protected async cancel(id: number): Promise<void> {
    const absence = this.lastPlanning?.absences.find((a) => a.id === id);
    if (absence?.status === 'APPROVED') {
      const confirmed = await this.confirm({
        title: 'Supprimer une absence acceptée',
        message:
          `Supprimer votre absence acceptée ${this.describe(absence)} ? ` +
          'Si c’est une récupération, ses heures seront rendues à votre solde.',
        confirmLabel: 'Supprimer',
      });
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

  private describe(a: PlanningAbsence): string {
    if (a.startTime) return `du ${frDate(a.startDate)} de ${a.startTime} à ${a.endTime}`;
    return a.startDate === a.endDate ? `du ${frDate(a.startDate)}` : `du ${frDate(a.startDate)} au ${frDate(a.endDate)}`;
  }

  private confirm(data: ConfirmDialogData): Promise<boolean | undefined> {
    return firstValueFrom(
      this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data }).afterClosed(),
    );
  }

  // ---------- vue Mois (FullCalendar) ----------

  /**
   * Vue Mois en lecture seule : une ligne par personne qui travaille ce jour-là (journée type ou heures sup), avec
   * prénom nom et heures. Fond blanc ; rayé gris s'il y a une absence ; vert fluo s'il y a des heures sup.
   */
  private async loadMonth(start: Date, end: Date, ids: Set<number>): Promise<EventInput[]> {
    try {
      const planning = await this.api.invoke(getPlanning, { from: toIsoDate(start), to: toIsoDate(end) });
      this.lastPlanning = planning;
      const label = (userId: number) => {
        const user = this.users().find((u) => u.id === userId);
        return user ? fullName(user) : `#${userId}`;
      };
      const lines = new Map<string, { userId: number; date: string; work: PlanningDay[]; overtimes: PlanningOvertime[] }>();
      const line = (userId: number, date: string) => {
        const key = `${userId}|${date}`;
        if (!lines.has(key)) lines.set(key, { userId, date, work: [], overtimes: [] });
        return lines.get(key)!;
      };
      planning.days.filter((d) => ids.has(d.userId)).forEach((d) => line(d.userId, d.date).work.push(d));
      planning.overtimes.filter((o) => ids.has(o.userId)).forEach((o) => line(o.userId, o.date).overtimes.push(o));
      const absencesOf = (userId: number, date: string) =>
        planning.absences.filter((a) => a.userId === userId && a.startDate <= date && date <= a.endDate);
      const status = (s: string) => (s === 'PENDING' ? 'en attente' : 'acceptée');

      const days: EventInput[] = [...lines.values()].map(({ userId, date, work, overtimes }) => {
        const hours = work.length
          ? `${work.map((d) => d.startTime).sort()[0]}–${work.map((d) => d.endTime).sort().at(-1)}`
          : '';
        const extra = overtimes
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((o) => `${o.startTime}–${o.endTime}`)
          .join(', ');
        const absences = absencesOf(userId, date);
        const isAbsent = absences.length > 0;
        // aperçu au survol : le détail complet, la ligne pouvant être coupée
        const preview = {
          name: label(userId),
          date: LONG_DATE.format(parseIso(date)),
          lines: [
            work.length ? `Horaires : ${[...work].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((d) => `${d.startTime}–${d.endTime}`).join(' / ')}` : 'Jour non travaillé',
            ...overtimes.map(
              (o) =>
                `Heures sup : ${o.startTime}–${o.endTime} (${o.status === 'PENDING' ? 'en attente' : 'acceptées'})` +
                (o.createdBy != null ? ', saisies par l’admin' : ''),
            ),
            ...absences.map(
              (a) => `Absence : ${a.startTime ? `${a.startTime}–${a.endTime}` : 'journée entière'} (${status(a.status)})`,
            ),
          ],
        };
        return {
          title: [label(userId), hours, extra && `+ heures sup ${extra}`].filter(Boolean).join(' · '),
          start: date,
          allDay: true,
          display: 'block',
          // couleur de l'employé pour le liseré (le fond est imposé par les classes pl-day*)
          color: colorFor(userId),
          contrastColor: '#202124',
          className: ['pl-day', overtimes.length ? 'pl-day-overtime' : '', isAbsent ? 'pl-day-absent' : '']
            .join(' ')
            .trim(),
          extendedProps: {
            rank: userId === this.meId() ? 1 : 2,
            sort: work[0]?.startTime ?? overtimes[0]?.startTime ?? '',
            preview,
          },
        };
      });
      const holidays: EventInput[] = planning.holidayWeeks.map((monday) => ({
        title: 'Vacances scolaires',
        start: monday,
        end: addDays(monday, 7),
        allDay: true,
        color: '#b2dfdb',
        contrastColor: '#00504a',
        extendedProps: { rank: 0 },
      }));
      return [...holidays, ...days];
    } catch (error) {
      this.notify(errorMessage(error, 'Impossible de charger le planning'));
      return [];
    }
  }

  /** Aperçu au survol d'une ligne de la vue Mois (sous la ligne, ou au-dessus en bas de l'écran). */
  private attachPreview(el: HTMLElement, preview: MonthPreview | undefined): void {
    if (!preview) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    el.addEventListener('mouseenter', () => {
      // petit délai : l'aperçu ne surgit pas au simple passage de la souris
      timer = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const above = rect.bottom > window.innerHeight - 140;
        this.preview.set({
          ...preview,
          x: Math.min(rect.left, window.innerWidth - 290),
          y: above ? rect.top - 4 : rect.bottom + 4,
          above,
        });
      }, PREVIEW_DELAY_MS);
    });
    el.addEventListener('mouseleave', () => {
      clearTimeout(timer);
      this.preview.set(null);
    });
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
