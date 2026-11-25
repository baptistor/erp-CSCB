import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { PlanningAbsence, PlanningDay, UserSummary } from '../../api/models';
import { BREAK } from '../../shared/schedule-rules';
import { colorFor, fullName, tint } from '../../shared/user-color';
import {
  blockPosition,
  CLICK_TOLERANCE_PX,
  gridBounds,
  initials,
  MinuteRange,
  selectionRange,
  toTime,
} from './week-grid-layout';

/** Hauteur d'une heure : ajustée pour que la journée tienne à l'écran, dans ces limites. */
const HOUR_HEIGHT_MIN_PX = 26;
const HOUR_HEIGHT_MAX_PX = 48;
/** Place prise au-dessus et sous la grille horaire (bandeau, onglets, navigation, en-têtes des jours, marges). */
const CHROME_PX = 290;
const DAY_LABELS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export interface RangeSelection {
  date: string;
  start: string;
  end: string;
}

export interface DaysSelection {
  startDate: string;
  endDate: string;
}

/** Clic sur une de mes plages : extraId renseigné pour des heures ajoutées, null pour la journée type. */
export interface OwnDayClick {
  date: string;
  extraId: number | null;
}

interface Drag {
  dayIndex: number;
  startY: number;
  currentY: number;
  height: number;
  ownDayClick: boolean;
  extraId: number | null;
}

/**
 * Vue Semaine « façon Google Agenda » (spec §1) : 7 jours, chaque jour découpé en une colonne par employé affiché.
 * Les absences s'affichent par-dessus les horaires, dans la colonne de l'employé. En mode sélection, on glisse sur la
 * colonne du jour (n'importe où) ou sur la ligne « Toute la journée » ; le parent décide quoi en faire.
 */
@Component({
  selector: 'app-week-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'onResize()' },
  template: `
    <div class="wg" [class.selectable]="selectable()" [class.dense]="people().length > 6" [style.--n]="people().length"
         [style.--day-min]="dayMinWidth()" [style.--hour-h]="hourHeight() + 'px'">
      <div class="row head">
        <div class="axis"></div>
        @for (day of days(); track day) {
          <div class="day-head" [class.today]="day === today()">
            <div class="day-title"><span class="dow">{{ dow(day) }}</span> <span class="num">{{ dayNum(day) }}</span></div>
            <div class="people">
              @for (p of people(); track p.id) {
                <span class="initials" [style.background]="color(p.id)" [title]="name(p)">{{ init(p) }}</span>
              }
            </div>
          </div>
        }
      </div>

      <div class="row allday">
        <div class="axis allday-label">Toute la journée</div>
        @for (day of days(); track day; let di = $index) {
          <div class="allday-cell" [class.selecting]="inDaysSelection(di)"
               (pointerdown)="daysDown($event, di)" (pointerenter)="daysEnter(di)" (pointerup)="daysUp()">
            @for (p of people(); track p.id) {
              <div class="sub">
                @for (a of fullDayAbsences(p.id, day); track a.id) {
                  <div class="absence neutral" [class.pending]="a.status === 'PENDING'" [title]="absenceTitle(p, a)">
                    {{ a.status === 'PENDING' ? 'En attente' : 'Absent·e' }}
                    @if (canCancel(a)) {
                      <button type="button" class="cancel" aria-label="Supprimer cette absence"
                              title="Supprimer cette absence"
                              (pointerdown)="$event.stopPropagation()" (click)="cancel(a.id, $event)">×</button>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>

      <div class="row body">
        <div class="axis hours" [style.height.px]="gridHeight()">
          @for (h of hourLabels(); track h.label) {
            <span class="hour" [style.top.px]="h.top">{{ h.label }}</span>
          }
        </div>
        @for (day of days(); track day; let di = $index) {
          <div class="day-col" [class.today]="day === today()" [style.height.px]="gridHeight()"
               (pointerdown)="down($event, di)" (pointermove)="move($event)" (pointerup)="up($event)"
               (pointercancel)="drag.set(null)">
            @for (p of people(); track p.id; let pi = $index) {
              <div class="sub" [style.left.%]="pi * 100 / people().length" [style.width.%]="100 / people().length">
                @for (w of work(p.id, day); track w.startTime) {
                  <div class="work" [class.mine]="p.id === meId()"
                       [style.top.%]="pos(w.startTime, w.endTime).top" [style.height.%]="pos(w.startTime, w.endTime).height"
                       [style.background]="color(p.id)" [title]="workTitle(p, w)" [attr.data-own-day]="p.id === meId() ? day : null" [attr.data-extra]="w.specialDayId">
                    @if (people().length <= 2) {
                      <span class="label">{{ w.startTime }}–{{ w.endTime }}</span>
                    }
                  </div>
                }
                @for (a of fullDayAbsences(p.id, day); track a.id) {
                  <!-- absence à la journée : toute la colonne de l'employé est barrée (hachures neutres) -->
                  <div class="absence-day" [class.pending]="a.status === 'PENDING'" [title]="absenceTitle(p, a)">
                    <span class="vlabel">{{ a.status === 'PENDING' ? 'Absence en attente' : 'Absent·e' }}</span>
                    @if (canCancel(a)) {
                      <button type="button" class="cancel" aria-label="Supprimer cette absence"
                              title="Supprimer cette absence"
                              (pointerdown)="$event.stopPropagation()" (click)="cancel(a.id, $event)">×</button>
                    }
                  </div>
                }
                @for (a of timedAbsences(p.id, day); track a.id) {
                  <div class="absence" [class.pending]="a.status === 'PENDING'" [style.--c]="color(p.id)" [style.--t]="tintOf(p.id)"
                       [style.top.%]="pos(a.startTime!, a.endTime!).top" [style.height.%]="pos(a.startTime!, a.endTime!).height"
                       [title]="absenceTitle(p, a)">
                    @if (canCancel(a)) {
                      <button type="button" class="cancel" aria-label="Supprimer cette absence"
                              title="Supprimer cette absence"
                              (pointerdown)="$event.stopPropagation()" (click)="cancel(a.id, $event)">×</button>
                    }
                  </div>
                }
              </div>
            }
            <!-- pause de midi : par-dessus tout, non sélectionnable -->
            <div class="break" title="Pause de midi 12:30–13:30" [style.top.%]="breakPos().top"
                 [style.height.%]="breakPos().height" (pointerdown)="$event.stopPropagation()"></div>
            @if (preview(); as pv) {
              @if (pv.dayIndex === di) {
                <div class="preview" [style.top.%]="pv.top" [style.height.%]="pv.height">{{ pv.label }}</div>
              }
            }
            @if (day === today() && nowTop() != null) {
              <div class="now" [style.top.%]="nowTop()"></div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; overflow-x: auto; }
    .wg { --axis-w: 56px; min-width: calc(var(--axis-w) + 7 * var(--day-min)); user-select: none;
      border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; overflow: clip;
      background: var(--planning-bg, var(--mat-sys-surface)); }
    .row { display: grid; grid-template-columns: var(--axis-w) repeat(7, minmax(var(--day-min), 1fr)); }
    /* colonne des heures figée pendant le défilement horizontal (overflow: clip ci-dessus, hidden l'empêcherait) */
    .axis { position: sticky; left: 0; z-index: 4; background: var(--planning-bg, var(--mat-sys-surface)); border-right: 1px solid var(--mat-sys-outline-variant); }
    .head { border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .day-head { padding: 6px 2px 4px; text-align: center; border-left: 1px solid var(--mat-sys-outline-variant); }
    .day-head .dow { font: var(--mat-sys-label-small); text-transform: uppercase; color: var(--mat-sys-on-surface-variant); }
    .day-head .num { font: var(--mat-sys-title-medium); }
    .day-head.today .num { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); border-radius: 50%;
      padding: 2px 7px; }
    .people { display: flex; margin-top: 4px; }
    .initials { flex: 1; min-width: 0; font: 600 10px/16px sans-serif; color: #fff; overflow: hidden; margin: 0 1px;
      border-radius: 4px; }
    .dense .initials { font-size: 9px; letter-spacing: -0.3px; border-radius: 3px; }
    .dense .work, .dense .absence, .dense .absence-day { border-radius: 3px; }
    .allday { border-bottom: 1px solid var(--mat-sys-outline-variant); min-height: 28px; }
    .allday-label { font: var(--mat-sys-label-small); color: var(--mat-sys-on-surface-variant); padding: 4px; }
    .allday-cell { display: flex; border-left: 1px solid var(--mat-sys-outline-variant); min-height: 28px; }
    .allday-cell .sub { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 2px 1px; }
    .allday-cell .absence { position: relative; font: var(--mat-sys-label-small); padding: 2px 4px; overflow: hidden;
      white-space: nowrap; }
    .selectable .allday-cell, .selectable .day-col { cursor: crosshair; }
    .allday-cell.selecting { background: color-mix(in srgb, var(--mat-sys-primary) 18%, transparent); }
    .hour { position: absolute; right: 6px; transform: translateY(-50%); font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant); }
    .day-col { position: relative; border-left: 1px solid var(--mat-sys-outline-variant);
      background-image: repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour-h) - 1px),
        var(--mat-sys-outline-variant) calc(var(--hour-h) - 1px) var(--hour-h)); }
    .day-col.today { background-color: color-mix(in srgb, var(--mat-sys-primary) 4%, transparent); }
    .day-col .sub { position: absolute; top: 0; bottom: 0; }
    .work { position: absolute; left: 1px; right: 1px; border-radius: 4px; opacity: 0.85; overflow: hidden; }
    .work .label { display: block; padding: 2px 4px; font: 600 11px/14px sans-serif; color: #fff; }
    /* absence : par-dessus les horaires, dans la colonne de l'employé */
    .absence { box-sizing: border-box; z-index: 1; border-radius: 4px; border: 1px solid var(--c);
      background: repeating-linear-gradient(45deg, var(--t) 0 5px, rgba(255, 255, 255, 0.95) 5px 10px); }
    .body .absence { position: absolute; left: 1px; right: 1px; }
    .absence.pending { border-style: dashed; border-color: #5f6368;
      background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.95) 0 5px, #c5c9ce 5px 10px); }
    /* absences à la journée : neutres (gris), quel que soit l'employé */
    .allday-cell .absence.neutral { border: 1px solid #5f6368; color: #202124; font-weight: 600;
      background: repeating-linear-gradient(135deg, rgba(95, 99, 104, 0.45) 0 3px, #eceff1 3px 9px); }
    .allday-cell .absence.neutral.pending { border-style: dashed;
      background: repeating-linear-gradient(135deg, rgba(95, 99, 104, 0.2) 0 3px, #fff 3px 9px); }
    .absence-day { position: absolute; top: 0; bottom: 0; left: 1px; right: 1px; z-index: 1; border-radius: 4px;
      border: 1px solid #5f6368; display: flex; align-items: flex-end; justify-content: center; overflow: hidden;
      padding-bottom: 8px; box-sizing: border-box;
      background: repeating-linear-gradient(135deg, #9aa0a6 0 3px, #eceff1 3px 11px); }
    .absence-day.pending { border-style: dashed;
      background: repeating-linear-gradient(135deg, #d5d8dc 0 3px, #fafafa 3px 11px); }
    .vlabel { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; padding: 6px 1px;
      border-radius: 3px; background: rgba(255, 255, 255, 0.9); color: #3c4043; font: 600 11px/12px sans-serif; }
    .cancel { position: absolute; top: 2px; right: 2px; z-index: 3; width: 18px; height: 18px; padding: 0; border: none;
      border-radius: 50%; background: var(--mat-sys-error); color: var(--mat-sys-on-error); font: 700 13px/18px sans-serif;
      cursor: pointer; }
    .break { position: absolute; left: 0; right: 0; z-index: 2; background: #e4e6e9; cursor: not-allowed;
      border-block: 1px solid var(--mat-sys-outline-variant); box-sizing: border-box; }
    /* colonnes étroites : la croix et le repère « journée » tiennent dans 14 px */
    .dense .cancel { right: 0; left: 0; margin: 0 auto; width: 12px; height: 16px; border-radius: 4px; font: 700 11px/16px sans-serif; }
    .dense .allday-cell .absence { padding: 0; font-size: 0; min-height: 20px; }
    .dense .absence-day { justify-content: center; }
    .preview { box-sizing: border-box; position: absolute; left: 0; right: 0; z-index: 2; border-radius: 4px; pointer-events: none;
      background: color-mix(in srgb, var(--mat-sys-primary) 25%, transparent); border: 2px solid var(--mat-sys-primary);
      font: 600 11px/14px sans-serif; color: var(--mat-sys-on-primary-container); padding: 2px 4px; }
    .now { position: absolute; left: 0; right: 0; z-index: 2; height: 2px; background: #d93025; pointer-events: none; }
  `,
})
export class WeekGrid {
  /** Les 7 jours affichés, 'YYYY-MM-DD'. */
  readonly days = input.required<string[]>();
  /** Personnes affichées, dans l'ordre des colonnes. */
  readonly people = input.required<UserSummary[]>();
  readonly planningDays = input.required<PlanningDay[]>();
  readonly absences = input.required<PlanningAbsence[]>();
  readonly meId = input.required<number | null>();
  readonly today = input.required<string>();
  /** Mode Édition : sélection à la souris active. */
  readonly selectable = input(false);
  /** Croix de suppression sur mes absences pas encore commencées (en attente ou acceptées). */
  readonly cancellable = input(false);
  /** Un clic simple sur une de mes journées émet ownDayClicked (sinon il sélectionne une heure). */
  readonly ownDayClickable = input(false);

  readonly rangeSelected = output<RangeSelection>();
  readonly daysSelected = output<DaysSelection>();
  /** Clic simple sur une de mes journées. */
  readonly ownDayClicked = output<OwnDayClick>();
  readonly cancelAbsence = output<number>();

  private readonly windowHeight = signal(window.innerHeight);
  protected readonly drag = signal<Drag | null>(null);
  private readonly daysDrag = signal<{ from: number; to: number } | null>(null);

  protected readonly color = colorFor;
  protected readonly name = fullName;
  protected readonly init = initials;

  protected onResize(): void {
    this.windowHeight.set(window.innerHeight);
  }

  private key(userId: number, date: string): string {
    return `${userId}|${date}`;
  }

  /** Plages travaillées (journée type + heures ajoutées), indexées par personne et date. */
  private readonly workIndex = computed(() => {
    const index = new Map<string, PlanningDay[]>();
    for (const d of this.planningDays()) {
      const k = this.key(d.userId, d.date);
      index.set(k, [...(index.get(k) ?? []), d]);
    }
    return index;
  });

  /** Absences par personne et date (une absence sur plusieurs jours apparaît chaque jour). */
  private readonly absenceIndex = computed(() => {
    const timed = new Map<string, PlanningAbsence[]>();
    const full = new Map<string, PlanningAbsence[]>();
    for (const a of this.absences()) {
      for (const date of this.days()) {
        if (date < a.startDate || date > a.endDate) continue;
        const target = a.startTime && a.endTime ? timed : full;
        const k = this.key(a.userId, date);
        target.set(k, [...(target.get(k) ?? []), a]);
      }
    }
    return { timed, full };
  });

  protected readonly bounds = computed(() =>
    gridBounds(this.planningDays().map((d) => ({ start: d.startTime, end: d.endTime }))),
  );

  protected readonly breakPos = computed(() => blockPosition(BREAK.start, BREAK.end, this.bounds()));

  protected readonly hourHeight = computed(() => {
    const fit = Math.floor((this.windowHeight() - CHROME_PX) / ((this.bounds().end - this.bounds().start) / 60));
    return Math.min(Math.max(fit, HOUR_HEIGHT_MIN_PX), HOUR_HEIGHT_MAX_PX);
  });

  protected readonly gridHeight = computed(() => ((this.bounds().end - this.bounds().start) / 60) * this.hourHeight());

  protected readonly hourLabels = computed(() => {
    const labels: { label: string; top: number }[] = [];
    for (let m = this.bounds().start + 60; m < this.bounds().end; m += 60) {
      labels.push({ label: `${String(m / 60).padStart(2, '0')} h`, top: ((m - this.bounds().start) / 60) * this.hourHeight() });
    }
    return labels;
  });

  /** Largeur minimale d'un jour : 14 px par personne (défilement horizontal au-delà). */
  protected readonly dayMinWidth = computed(() => `${Math.max(this.people().length * 14, 90)}px`);

  protected readonly nowTop = computed(() => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const { start, end } = this.bounds();
    return minutes < start || minutes > end ? null : ((minutes - start) / (end - start)) * 100;
  });

  protected readonly preview = computed(() => {
    const drag = this.drag();
    if (!drag) return null;
    const range = selectionRange(drag.startY, drag.currentY, drag.height, this.bounds());
    const p = this.posMinutes(range);
    return { dayIndex: drag.dayIndex, ...p, label: `${toTime(range.start)}–${toTime(range.end)}` };
  });

  protected work(userId: number, date: string): PlanningDay[] {
    return this.workIndex().get(this.key(userId, date)) ?? [];
  }

  protected timedAbsences(userId: number, date: string): PlanningAbsence[] {
    return this.absenceIndex().timed.get(this.key(userId, date)) ?? [];
  }

  protected fullDayAbsences(userId: number, date: string): PlanningAbsence[] {
    return this.absenceIndex().full.get(this.key(userId, date)) ?? [];
  }

  protected pos(start: string, end: string): { top: number; height: number } {
    return blockPosition(start, end, this.bounds());
  }

  private posMinutes(range: MinuteRange): { top: number; height: number } {
    return blockPosition(toTime(range.start), toTime(range.end), this.bounds());
  }

  /** Mes absences, en attente ou acceptées, pas encore commencées (spec §3). */
  protected canCancel(a: PlanningAbsence): boolean {
    return this.cancellable() && a.userId === this.meId() && a.startDate >= this.today();
  }

  protected tintOf(userId: number): string {
    return tint(colorFor(userId), 0.55);
  }

  protected dow(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return DAY_LABELS[new Date(y, m - 1, d).getDay()];
  }

  protected dayNum(date: string): number {
    return Number(date.slice(8, 10));
  }

  protected workTitle(p: UserSummary, w: PlanningDay): string {
    return `${fullName(p)} — ${w.startTime}–${w.endTime}`;
  }

  protected absenceTitle(p: UserSummary, a: PlanningAbsence): string {
    const when = a.startTime ? `${a.startTime}–${a.endTime}` : 'journée entière';
    return `${fullName(p)} — absence ${a.status === 'PENDING' ? 'en attente' : 'approuvée'} (${when})`;
  }

  protected cancel(id: number, event: Event): void {
    event.stopPropagation();
    this.cancelAbsence.emit(id);
  }

  // ---------- sélection sur la grille horaire ----------

  protected down(event: PointerEvent, dayIndex: number): void {
    if (!this.selectable() || event.button !== 0) return;
    const column = event.currentTarget as HTMLElement;
    const rect = column.getBoundingClientRect();
    const target = event.target as HTMLElement;
    column.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    const y = event.clientY - rect.top;
    this.drag.set({
      dayIndex,
      startY: y,
      currentY: y,
      height: rect.height,
      ownDayClick: target.closest('[data-own-day]') != null,
      extraId: Number(target.closest('[data-extra]')?.getAttribute('data-extra')) || null,
    });
  }

  protected move(event: PointerEvent): void {
    const drag = this.drag();
    if (!drag) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.drag.set({ ...drag, currentY: event.clientY - rect.top });
  }

  protected up(event: PointerEvent): void {
    const drag = this.drag();
    if (!drag) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const endY = event.clientY - rect.top;
    this.drag.set(null);
    const date = this.days()[drag.dayIndex];
    if (this.ownDayClickable() && drag.ownDayClick && Math.abs(endY - drag.startY) < CLICK_TOLERANCE_PX) {
      this.ownDayClicked.emit({ date, extraId: drag.extraId });
      return;
    }
    const range = selectionRange(drag.startY, endY, drag.height, this.bounds());
    this.rangeSelected.emit({ date, start: toTime(range.start), end: toTime(range.end) });
  }

  // ---------- sélection de journées entières ----------

  protected inDaysSelection(dayIndex: number): boolean {
    const sel = this.daysDrag();
    return !!sel && dayIndex >= Math.min(sel.from, sel.to) && dayIndex <= Math.max(sel.from, sel.to);
  }

  protected daysDown(event: PointerEvent, dayIndex: number): void {
    if (!this.selectable() || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.daysDrag.set({ from: dayIndex, to: dayIndex });
    window.addEventListener('pointerup', () => this.daysUp(), { once: true });
  }

  protected daysEnter(dayIndex: number): void {
    const sel = this.daysDrag();
    if (sel) this.daysDrag.set({ ...sel, to: dayIndex });
  }

  protected daysUp(): void {
    const sel = this.daysDrag();
    if (!sel) return;
    this.daysDrag.set(null);
    const days = this.days();
    this.daysSelected.emit({
      startDate: days[Math.min(sel.from, sel.to)],
      endDate: days[Math.max(sel.from, sel.to)],
    });
  }
}
