import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import type {
  CalendarOptions,
  DateSelectInfo,
  EventChangeInfo,
  EventClickInfo,
  EventInput,
  EventSourceFuncInfo,
} from 'fullcalendar';
import frLocale from 'fullcalendar/locales/fr';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api/api';
import { AuthService } from '../../core/auth/auth.service';
import { canEditDay } from '../../shared/schedule-rules';
import { createSpecialDay, deleteSpecialDay, getPlanning, getUsers, updateSpecialDay } from '../../api/functions';
import { PlanningDay, SpecialDayInput, UserSummary } from '../../api/models';
import { addDays, errorMessage, toHHmm, toIsoDate } from '../../shared/dates';
import { colorFor, fullName, tint } from '../../shared/user-color';
import { DayDialog, DayDialogData, DayDialogResult } from './day-dialog';

interface DayProps {
  kind: 'day';
  day: PlanningDay;
}

/**
 * Planning de l'équipe : journée spéciale sinon journée type (spec §1), + absences approuvées.
 * Clic, sélection, drag & resize créent/modifient des journées spéciales, selon les droits (canEditDay) :
 * l'admin toutes, l'employé les siennes à partir d'aujourd'hui. [adminMode] : écran d'édition admin.
 */
@Component({
  selector: 'app-planning-calendar',
  imports: [FullCalendarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (users().length) {
      <ul class="legend" aria-label="Légende">
        @for (user of users(); track user.id) {
          <li><span class="dot" [style.background]="color(user.id)"></span>{{ name(user) }}</li>
        }
        <li><span class="dot special"></span>« ★ » journée spéciale (exception à la journée type)</li>
        <li><span class="dot absence"></span>Absence approuvée</li>
      </ul>
    }
    <full-calendar [options]="options()" />
  `,
  styles: `
    :host { display: block; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; list-style: none; padding: 0; margin: 0 0 16px; }
    .legend li { display: flex; align-items: center; gap: 6px; font: var(--mat-sys-body-small); }
    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; box-sizing: border-box; }
    .dot.special { background: #fff; border: 2px dashed #5f6368; }
    .dot.absence { background: #d7dce0; border: 1px solid #9aa0a6; }
  `,
})
export class PlanningCalendar {
  /** Écran d'administration (affiche les journées « non travaillé » de tout le monde). */
  readonly adminMode = input(false);

  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly calendar = viewChild.required(FullCalendarComponent);
  private readonly auth = inject(AuthService);

  protected readonly users = signal<UserSummary[]>([]);
  private readonly usersById = computed(() => new Map(this.users().map((u) => [u.id, u])));
  private usersLoading?: Promise<void>;

  protected readonly color = colorFor;
  protected readonly name = fullName;

  protected readonly options = computed<CalendarOptions>(() => {
    const me = this.auth.currentUser();
    return {
      plugins: [themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin],
      locale: frLocale,
      firstDay: 1,
      // Semaine en liste par défaut (lisible avec beaucoup de monde) ; grille horaire pour ajuster les heures
      initialView: 'dayGridWeek',
      headerToolbar: { start: 'prev,next today', center: 'title', end: 'dayGridWeek,timeGridWeek,dayGridMonth' },
      buttons: {
        dayGridWeek: { text: 'Semaine' },
        timeGridWeek: { text: 'Grille horaire' },
      },
      displayEventEnd: true,
      slotMinTime: '07:00:00',
      slotMaxTime: '21:00:00',
      height: 'auto',
      nowIndicator: true,
      slotEventOverlap: false,
      eventTimeFormat: { hour: '2-digit', minute: '2-digit' },
      events: (info: EventSourceFuncInfo) => this.loadEvents(info.start, info.end),
      // droits fins par événement (cf. loadEvents) ; sélection limitée aux jours modifiables
      editable: false,
      selectable: me != null,
      selectMirror: true,
      selectAllow: (span) => canEditDay(me, me?.id ?? -1, toIsoDate(span.start), toIsoDate(new Date())),
      select: (info) => void this.onSelect(info),
      eventClick: (info) => void this.onEventClick(info),
      eventDrop: (info) => void this.onEventMoved(info),
      eventResize: (info) => void this.onEventMoved(info),
    };
  });

  private async ensureUsers(): Promise<void> {
    this.usersLoading ??= this.api.invoke(getUsers).then((users) => this.users.set(users));
    return this.usersLoading;
  }

  private label(userId: number): string {
    const user = this.usersById().get(userId);
    return user ? fullName(user) : `#${userId}`;
  }

  private async loadEvents(start: Date, end: Date): Promise<EventInput[]> {
    try {
      await this.ensureUsers();
      const planning = await this.api.invoke(getPlanning, { from: toIsoDate(start), to: toIsoDate(end) });
      const days: EventInput[] = [];
      for (const day of planning.days) {
        const special = day.specialDayId != null;
        const props: DayProps = { kind: 'day', day };
        const editable = this.canEdit(day);
        if (day.startTime && day.endTime) {
          days.push({
            id: `day-${day.userId}-${day.date}`,
            title: special ? `★ ${this.label(day.userId)}` : this.label(day.userId),
            start: `${day.date}T${day.startTime}`,
            end: `${day.date}T${day.endTime}`,
            color: colorFor(day.userId),
            className: special ? 'planning-special' : 'planning-typical',
            editable,
            extendedProps: props,
          });
        } else if (this.adminMode() || day.userId === this.auth.currentUser()?.id) {
          // journée spéciale « non travaillé » : visible pour l'admin et pour l'intéressé (pour l'annuler)
          days.push({
            id: `day-${day.userId}-${day.date}`,
            title: `★ ${this.label(day.userId)} — non travaillé`,
            start: day.date,
            allDay: true,
            editable: false,
            color: '#e8eaed',
            contrastColor: '#3c4043',
            extendedProps: props,
          });
        }
      }
      const absences: EventInput[] = planning.absences.map((absence) => ({
        id: `absence-${absence.id}`,
        title: `${this.label(absence.userId)} — absent·e`,
        start: absence.startDate,
        end: addDays(absence.endDate, 1), // fin exclusive côté FullCalendar
        allDay: true,
        editable: false,
        color: tint(colorFor(absence.userId)),
        contrastColor: '#202124',
      }));
      return [...absences, ...days];
    } catch (error) {
      this.notify(errorMessage(error, 'Impossible de charger le planning'));
      return [];
    }
  }

  private isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'ADMIN';
  }

  private canEdit(day: PlanningDay): boolean {
    return canEditDay(this.auth.currentUser(), day.userId, day.date, toIsoDate(new Date()));
  }

  /** Sélection d'une plage vide : nouvelle journée spéciale (l'admin choisit l'employé, l'employé = lui-même). */
  private async onSelect(info: DateSelectInfo): Promise<void> {
    this.calendar().getApi().unselect();
    const me = this.auth.currentUser();
    if (!me) return;
    await this.ensureUsers();
    const admin = this.isAdmin();
    const result = await this.openDialog({
      users: admin ? this.users() : this.users().filter((u) => u.id === me.id),
      lockUser: !admin,
      initial: {
        userId: admin ? undefined : me.id,
        date: toIsoDate(info.start),
        startTime: info.allDay ? '09:00' : toHHmm(info.start),
        endTime: info.allDay ? '17:00' : toHHmm(info.end),
      },
    });
    if (result?.action === 'save') {
      await this.mutate(() => this.api.invoke(createSpecialDay, { body: result.input }), 'Journée spéciale créée');
    }
  }

  /** Clic sur une journée (type ou spéciale) : la modifier pour cette date. */
  private async onEventClick(info: EventClickInfo): Promise<void> {
    const props = info.event.extendedProps as Partial<DayProps>;
    if (props.kind !== 'day' || !props.day || !this.canEdit(props.day)) return;
    const day = props.day;
    const result = await this.openDialog({
      users: this.users(),
      initial: { userId: day.userId, date: day.date, startTime: day.startTime, endTime: day.endTime },
      existing: { specialDayId: day.specialDayId ?? null },
    });
    if (result?.action === 'save') {
      await this.saveDay(day, result.input, 'Journée modifiée');
    } else if (result?.action === 'reset' && day.specialDayId != null) {
      const id = day.specialDayId;
      await this.mutate(() => this.api.invoke(deleteSpecialDay, { id }), 'Retour à la journée type');
    }
  }

  /** Drag ou resize d'une journée : nouvelles heures pour CE jour (journée spéciale). */
  private async onEventMoved(info: EventChangeInfo): Promise<void> {
    const props = info.event.extendedProps as Partial<DayProps>;
    const { start, end, allDay } = info.event;
    if (props.kind !== 'day' || !props.day || !start || !end || allDay || toIsoDate(start) !== props.day.date
      || toIsoDate(end) !== props.day.date) {
      info.revert();
      this.notify('Seules les heures se modifient ici ; pour un autre jour, cliquez sur la journée concernée.');
      return;
    }
    const input: SpecialDayInput = {
      userId: props.day.userId,
      date: props.day.date,
      startTime: toHHmm(start),
      endTime: toHHmm(end),
    };
    const ok = await this.saveDay(props.day, input, 'Horaires du jour modifiés');
    if (!ok) info.revert();
  }

  /** Crée la journée spéciale, ou la met à jour si elle existe déjà. */
  private saveDay(day: PlanningDay, input: SpecialDayInput, success: string): Promise<boolean> {
    const id = day.specialDayId;
    return this.mutate(
      () =>
        id != null
          ? this.api.invoke(updateSpecialDay, { id, body: input })
          : this.api.invoke(createSpecialDay, { body: input }),
      success,
    );
  }

  private openDialog(data: DayDialogData): Promise<DayDialogResult | undefined> {
    return firstValueFrom(
      this.dialog.open<DayDialog, DayDialogData, DayDialogResult>(DayDialog, { data }).afterClosed(),
    );
  }

  private async mutate(call: () => Promise<unknown>, success: string): Promise<boolean> {
    try {
      await call();
      this.notify(success);
      return true;
    } catch (error) {
      this.notify(errorMessage(error));
      return false;
    } finally {
      this.calendar().getApi().refetchEvents();
    }
  }

  private notify(message: string): void {
    this.snack.open(message, 'OK', { duration: 5000 });
  }
}
