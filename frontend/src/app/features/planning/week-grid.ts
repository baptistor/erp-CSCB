import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { PlanningAbsence, PlanningDay, PlanningOvertime, UserSummary } from '../../api/models';
import { BREAK } from '../../shared/schedule-rules';
import { colorFor, fullName, OVERTIME_COLOR, tint } from '../../shared/user-color';
import { Draft, moveDraft, resizeDraft } from './draft';
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
const CHROME_PX = 270;
/** La plage à placer peut sortir de la grille affichée (qui s'élargit) : de 00:00 à 24:00. */
const WHOLE_DAY = { start: 0, end: 24 * 60 };
const DAY_LABELS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** Clic (start = end = minute cliquée) ou sélection glissée sur un jour, en minutes depuis minuit. */
export interface GridPick {
  date: string;
  start: number;
  end: number;
  click: boolean;
}

export interface DaysSelection {
  startDate: string;
  endDate: string;
}

interface Drag {
  dayIndex: number;
  startY: number;
  currentY: number;
  height: number;
}

/** Déplacement / étirement de la plage à placer. */
interface DraftDrag {
  edge: 'move' | 'start' | 'end';
  startY: number;
  column: DOMRect;
  original: Draft;
}

/**
 * Vue Semaine « façon Google Agenda » (spec §1) : lundi → samedi (centre fermé le dimanche), chaque jour découpé en une colonne par employé affiché.
 * Absences et heures sup (vert fluo) par-dessus les horaires, dans la colonne de l'employé. Un clic (ou appui +
 * glisser) sur un jour est transmis au parent, qui décide de la plage à placer ; celle-ci se déplace et s'étire ici.
 */
@Component({
  selector: 'app-week-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'onResize()', '(document:keydown.escape)': 'onEscape()' },
  template: `
    <div class="wg" [class.dense]="people().length > 6" [style.--n]="people().length" [style.--cols]="days().length"
         [style.--day-min]="dayMinWidth()" [style.--hour-h]="hourHeight() + 'px'" [style.--overtime]="overtimeColor">
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
          <div class="allday-cell" [class.selecting]="inDaysSelection(di)" title="Glisser pour poser une absence à la journée"
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
                  <div class="work" [style.top.%]="pos(w.startTime, w.endTime).top"
                       [style.height.%]="pos(w.startTime, w.endTime).height"
                       [style.background]="color(p.id)" [title]="workTitle(p, w)">
                    @if (people().length <= 2) {
                      <span class="label">{{ w.startTime }}–{{ w.endTime }}</span>
                    }
                  </div>
                }
                @for (o of overtimesOf(p.id, day); track o.id) {
                  <div class="overtime" [class.pending]="o.status === 'PENDING'" [class.mine]="p.id === meId()"
                       [style.top.%]="pos(o.startTime, o.endTime).top" [style.height.%]="pos(o.startTime, o.endTime).height"
                       [title]="overtimeTitle(p, o)" [attr.data-overtime]="p.id === meId() || manageAllOvertimes() ? o.id : null">
                    @if (people().length <= 2) {
                      <span class="label">{{ o.startTime }}–{{ o.endTime }}</span>
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
            <!-- pause de midi (semaines classiques) : par-dessus tout, non sélectionnable -->
            @if (!noBreak()) {
              <div class="break" title="Pause de midi 12:30–13:30" [style.top.%]="breakPos().top"
                   [style.height.%]="breakPos().height" (pointerdown)="$event.stopPropagation()"></div>
            }
            @if (preview(); as pv) {
              @if (pv.dayIndex === di) {
                <div class="preview" [style.top.%]="pv.top" [style.height.%]="pv.height">{{ pv.label }}</div>
              }
            }
            @if (draft(); as d) {
              @if (d.date === day) {
                <!-- plage à placer : glisser pour déplacer, poignées pour étirer, ✓ pour valider -->
                <div class="draft" [class.overtime-draft]="d.kind === 'overtime'" [class.invalid]="!!draftError()"
                     [style.top.%]="draftPos().top" [style.height.%]="draftPos().height"
                     (pointerdown)="draftDown($event, 'move')" (pointermove)="draftMove($event)"
                     (pointerup)="draftUp()" (pointercancel)="draftUp()">
                  <div class="handle top" (pointerdown)="draftDown($event, 'start')" title="Étirer"></div>
                  <div class="handle bottom" (pointerdown)="draftDown($event, 'end')" title="Étirer"></div>
                </div>
                <div class="draft-bar" [class.above]="barAbove()" [class.right]="di >= 5"
                     [style.top.%]="barAbove() ? draftPos().top : draftPos().top + draftPos().height"
                     (pointerdown)="$event.stopPropagation()">
                  <div class="draft-text">
                    <strong>{{ d.kind === 'absence' ? 'Absence' : 'Heures sup' }}{{ draftFor() ? ' pour ' + draftFor() : '' }}</strong>
                    {{ time(d.start) }}–{{ time(d.end) }} · {{ draftHoursText() }}
                    @if (draftError(); as error) {
                      <span class="draft-error">{{ error }}</span>
                    }
                  </div>
                  <button type="button" class="ok" [disabled]="!!draftError()" (click)="draftConfirm.emit()"
                          [attr.aria-label]="d.kind === 'absence' ? 'Demander cette absence' : 'Demander ces heures sup'"
                          [title]="d.kind === 'absence' ? 'Demander cette absence' : 'Demander ces heures sup'">✓</button>
                  <button type="button" class="ko" (click)="draftCancel.emit()" aria-label="Abandonner"
                          title="Abandonner (Échap)">✕</button>
                </div>
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
    .wg { --axis-w: 56px; min-width: calc(var(--axis-w) + var(--cols) * var(--day-min)); user-select: none;
      border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; overflow: clip;
      background: var(--planning-bg, var(--mat-sys-surface)); }
    .row { display: grid; grid-template-columns: var(--axis-w) repeat(var(--cols), minmax(var(--day-min), 1fr)); }
    /* colonne des heures figée pendant le défilement horizontal (overflow: clip ci-dessus, hidden l'empêcherait) */
    .axis { position: sticky; left: 0; z-index: 6; background: var(--planning-bg, var(--mat-sys-surface));
      border-right: 1px solid var(--mat-sys-outline-variant); }
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
    .dense .work, .dense .absence, .dense .absence-day, .dense .overtime { border-radius: 3px; }
    .allday { border-bottom: 1px solid var(--mat-sys-outline-variant); min-height: 28px; }
    .allday-label { font: var(--mat-sys-label-small); color: var(--mat-sys-on-surface-variant); padding: 4px; }
    .allday-cell { display: flex; border-left: 1px solid var(--mat-sys-outline-variant); min-height: 28px; cursor: crosshair; }
    .allday-cell .sub { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 2px 1px; }
    .allday-cell .absence { position: relative; font: var(--mat-sys-label-small); padding: 2px 4px; overflow: hidden;
      white-space: nowrap; }
    .allday-cell.selecting { background: color-mix(in srgb, var(--mat-sys-primary) 18%, transparent); }
    .hour { position: absolute; right: 6px; transform: translateY(-50%); font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant); }
    .day-col { position: relative; cursor: crosshair; border-left: 1px solid var(--mat-sys-outline-variant);
      background-image: repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour-h) - 1px),
        var(--mat-sys-outline-variant) calc(var(--hour-h) - 1px) var(--hour-h)); }
    .day-col.today { background-color: color-mix(in srgb, var(--mat-sys-primary) 4%, transparent); }
    .day-col .sub { position: absolute; top: 0; bottom: 0; }
    .work { position: absolute; left: 1px; right: 1px; border-radius: 4px; opacity: 0.85; overflow: hidden; }
    .work .label { display: block; padding: 2px 4px; font: 600 11px/14px sans-serif; color: #fff; }
    /* heures sup : vert fluo pour tout le monde ; en attente = hachurées */
    .overtime { position: absolute; left: 1px; right: 1px; box-sizing: border-box; border-radius: 4px; overflow: hidden;
      background: var(--overtime); border: 1px solid #1f8a0b; }
    .overtime.pending { border-style: dashed;
      background: repeating-linear-gradient(45deg, var(--overtime) 0 5px, rgba(255, 255, 255, 0.9) 5px 10px); }
    .overtime[data-overtime] { cursor: pointer; }
    .overtime .label { display: block; padding: 2px 4px; font: 600 11px/14px sans-serif; color: #0b3d02; }
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
    /* croix de suppression : au survol de l'absence (toujours visible au clavier) */
    .cancel { position: absolute; top: 2px; right: 2px; z-index: 3; width: 18px; height: 18px; padding: 0; border: none;
      border-radius: 50%; background: var(--mat-sys-error); color: var(--mat-sys-on-error); font: 700 13px/18px sans-serif;
      cursor: pointer; opacity: 0; transition: opacity 0.15s; }
    .absence:hover .cancel, .absence-day:hover .cancel, .cancel:focus-visible { opacity: 1; }
    @media (hover: none) { .cancel { opacity: 1; } }
    .break { position: absolute; left: 0; right: 0; z-index: 2; background: #e4e6e9; cursor: not-allowed;
      border-block: 1px solid var(--mat-sys-outline-variant); box-sizing: border-box; }
    /* colonnes étroites : la croix et le repère « journée » tiennent dans 14 px */
    .dense .cancel { right: 0; left: 0; margin: 0 auto; width: 12px; height: 16px; border-radius: 4px; font: 700 11px/16px sans-serif; }
    .dense .allday-cell .absence { padding: 0; font-size: 0; min-height: 20px; }
    .dense .absence-day { justify-content: center; }
    .preview { box-sizing: border-box; position: absolute; left: 0; right: 0; z-index: 4; border-radius: 4px; pointer-events: none;
      background: color-mix(in srgb, var(--mat-sys-primary) 25%, transparent); border: 2px solid var(--mat-sys-primary);
      font: 600 11px/14px sans-serif; color: var(--mat-sys-on-primary-container); padding: 2px 4px; }
    /* plage à placer : sur toute la largeur du jour, au-dessus de tout */
    .draft { position: absolute; left: 0; right: 0; z-index: 5; box-sizing: border-box; border-radius: 4px; cursor: grab;
      touch-action: none; border: 2px solid #5f6368;
      background: repeating-linear-gradient(45deg, rgba(95, 99, 104, 0.35) 0 6px, rgba(255, 255, 255, 0.85) 6px 12px); }
    .draft.overtime-draft { border-color: #1f8a0b;
      background: repeating-linear-gradient(45deg, var(--overtime) 0 6px, rgba(255, 255, 255, 0.7) 6px 12px); }
    .draft.invalid { border-color: var(--mat-sys-error); background: color-mix(in srgb, var(--mat-sys-error) 22%, transparent); }
    .draft:active { cursor: grabbing; }
    .handle { position: absolute; left: 0; right: 0; height: 8px; cursor: ns-resize; }
    .handle.top { top: -4px; }
    .handle.bottom { bottom: -4px; }
    .draft-bar { position: absolute; left: 0; z-index: 7; display: flex; align-items: center; gap: 6px; margin-top: 4px;
      padding: 4px 4px 4px 10px; min-width: 250px; border-radius: 8px; box-shadow: var(--mat-sys-level2);
      background: var(--mat-sys-surface-container-highest); font: var(--mat-sys-body-small); cursor: default; }
    .draft-bar.above { transform: translateY(calc(-100% - 8px)); }
    .draft-bar.right { left: auto; right: 0; }
    .draft-text { flex: 1; min-width: 0; }
    .draft-error { display: block; color: var(--mat-sys-error); }
    .draft-bar button { flex: none; width: 30px; height: 30px; border: none; border-radius: 50%; cursor: pointer;
      font: 700 15px/30px sans-serif; }
    .ok { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
    .ok:disabled { opacity: 0.35; cursor: not-allowed; }
    .ko { background: transparent; color: var(--mat-sys-on-surface-variant); }
    .now { position: absolute; left: 0; right: 0; z-index: 2; height: 2px; background: #d93025; pointer-events: none; }
  `,
})
export class WeekGrid {
  /** Jours affichés (lundi → samedi), 'YYYY-MM-DD'. */
  readonly days = input.required<string[]>();
  /** Semaine de vacances scolaires : pas de pause de midi. */
  readonly noBreak = input(false);
  /** Personnes affichées, dans l'ordre des colonnes. */
  readonly people = input.required<UserSummary[]>();
  readonly planningDays = input.required<PlanningDay[]>();
  readonly overtimes = input.required<PlanningOvertime[]>();
  readonly absences = input.required<PlanningAbsence[]>();
  readonly meId = input.required<number | null>();
  readonly today = input.required<string>();
  /** Plage à placer (absence ou heures sup), affichée sur toute la largeur de son jour. */
  readonly draft = input<Draft | null>(null);
  readonly draftError = input<string | null>(null);
  readonly draftHoursText = input('');
  /** Nom de l'employé pour qui l'admin pose la plage ('' = moi). */
  readonly draftFor = input('');
  /** ADMIN : toutes les heures sup sont cliquables (pour les retirer). */
  readonly manageAllOvertimes = input(false);

  /** Clic ou sélection glissée sur un jour (hors pause). */
  readonly picked = output<GridPick>();
  readonly daysSelected = output<DaysSelection>();
  /** Clic sur une de mes heures sup. */
  readonly overtimeClicked = output<number>();
  readonly cancelAbsence = output<number>();
  readonly draftChange = output<Draft>();
  readonly draftConfirm = output<void>();
  readonly draftCancel = output<void>();

  private readonly windowHeight = signal(window.innerHeight);
  protected readonly drag = signal<Drag | null>(null);
  private readonly daysDrag = signal<{ from: number; to: number } | null>(null);
  private draftDrag: DraftDrag | null = null;

  protected readonly color = colorFor;
  protected readonly name = fullName;
  protected readonly init = initials;
  protected readonly time = toTime;
  protected readonly overtimeColor = OVERTIME_COLOR;

  protected onResize(): void {
    this.windowHeight.set(window.innerHeight);
  }

  protected onEscape(): void {
    if (this.draft()) this.draftCancel.emit();
  }

  private key(userId: number, date: string): string {
    return `${userId}|${date}`;
  }

  private index<T extends { userId: number; date: string }>(items: T[]): Map<string, T[]> {
    const index = new Map<string, T[]>();
    for (const item of items) {
      const k = this.key(item.userId, item.date);
      index.set(k, [...(index.get(k) ?? []), item]);
    }
    return index;
  }

  /** Journée type et heures sup, indexées par personne et date. */
  private readonly workIndex = computed(() => this.index(this.planningDays()));
  private readonly overtimeIndex = computed(() => this.index(this.overtimes()));

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

  /** 07:00–21:00, élargies aux horaires, heures sup et à la plage en cours (qui peut aller de 00:00 à 24:00). */
  protected readonly bounds = computed(() => {
    const draft = this.draft();
    return gridBounds([
      ...[...this.planningDays(), ...this.overtimes()].map((d) => ({ start: d.startTime, end: d.endTime })),
      ...(draft ? [{ start: toTime(draft.start), end: toTime(draft.end) }] : []),
    ]);
  });

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
    if (!drag || Math.abs(drag.currentY - drag.startY) < CLICK_TOLERANCE_PX) return null;
    const range = selectionRange(drag.startY, drag.currentY, drag.height, this.bounds());
    const p = this.posMinutes(range);
    return { dayIndex: drag.dayIndex, ...p, label: `${toTime(range.start)}–${toTime(range.end)}` };
  });

  protected readonly draftPos = computed(() => {
    const d = this.draft();
    return d ? this.posMinutes(d) : { top: 0, height: 0 };
  });

  /** Barre d'actions au-dessus de la plage quand celle-ci est en bas de la grille. */
  protected readonly barAbove = computed(() => this.draftPos().top + this.draftPos().height > 80);

  protected work(userId: number, date: string): PlanningDay[] {
    return this.workIndex().get(this.key(userId, date)) ?? [];
  }

  protected overtimesOf(userId: number, date: string): PlanningOvertime[] {
    return this.overtimeIndex().get(this.key(userId, date)) ?? [];
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
    return a.userId === this.meId() && a.startDate >= this.today();
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

  protected overtimeTitle(p: UserSummary, o: PlanningOvertime): string {
    const status = o.status === 'PENDING' ? 'en attente' : 'acceptées';
    const byAdmin = o.createdBy != null ? ', saisies par l’admin' : '';
    const hint =
      p.id === this.meId() && o.status === 'PENDING'
        ? ' — cliquer pour annuler la demande'
        : this.manageAllOvertimes()
          ? ' — cliquer pour retirer'
          : '';
    return `${fullName(p)} — heures sup ${status}${byAdmin} (${o.startTime}–${o.endTime})${hint}`;
  }

  protected absenceTitle(p: UserSummary, a: PlanningAbsence): string {
    const when = a.startTime ? `${a.startTime}–${a.endTime}` : 'journée entière';
    return `${fullName(p)} — absence ${a.status === 'PENDING' ? 'en attente' : 'approuvée'} (${when})`;
  }

  protected cancel(id: number, event: Event): void {
    event.stopPropagation();
    this.cancelAbsence.emit(id);
  }

  // ---------- clic / sélection sur la grille horaire ----------

  protected down(event: PointerEvent, dayIndex: number): void {
    if (event.button !== 0) return;
    const column = event.currentTarget as HTMLElement;
    const rect = column.getBoundingClientRect();
    column.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    const y = event.clientY - rect.top;
    this.drag.set({ dayIndex, startY: y, currentY: y, height: rect.height });
    this.pressedOvertime = Number((event.target as HTMLElement).closest('[data-overtime]')?.getAttribute('data-overtime')) || null;
  }

  private pressedOvertime: number | null = null;

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
    const { start, end } = this.bounds();
    if (Math.abs(endY - drag.startY) < CLICK_TOLERANCE_PX) {
      if (this.pressedOvertime != null) {
        this.overtimeClicked.emit(this.pressedOvertime);
        return;
      }
      const minute = Math.floor(start + (Math.min(Math.max(drag.startY, 0), drag.height) / drag.height) * (end - start));
      this.picked.emit({ date, start: minute, end: minute, click: true });
      return;
    }
    const range = selectionRange(drag.startY, endY, drag.height, this.bounds());
    this.picked.emit({ date, start: range.start, end: range.end, click: false });
  }

  // ---------- plage à placer : déplacer / étirer ----------

  protected draftDown(event: PointerEvent, edge: DraftDrag['edge']): void {
    const draft = this.draft();
    if (event.button !== 0 || !draft) return;
    event.stopPropagation();
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const block = target.closest('.draft') as HTMLElement;
    block.setPointerCapture?.(event.pointerId);
    const column = (block.closest('.day-col') as HTMLElement).getBoundingClientRect();
    this.draftDrag = { edge, startY: event.clientY, column, original: draft };
  }

  protected draftMove(event: PointerEvent): void {
    const drag = this.draftDrag;
    if (!drag) return;
    const { start, end } = this.bounds();
    const minutesPerPx = (end - start) / drag.column.height;
    if (drag.edge === 'move') {
      this.draftChange.emit(moveDraft(drag.original, (event.clientY - drag.startY) * minutesPerPx, WHOLE_DAY));
    } else {
      const minute = start + (event.clientY - drag.column.top) * minutesPerPx;
      this.draftChange.emit(resizeDraft(drag.original, drag.edge, minute, WHOLE_DAY));
    }
  }

  protected draftUp(): void {
    this.draftDrag = null;
  }

  // ---------- sélection de journées entières ----------

  protected inDaysSelection(dayIndex: number): boolean {
    const sel = this.daysDrag();
    return !!sel && dayIndex >= Math.min(sel.from, sel.to) && dayIndex <= Math.max(sel.from, sel.to);
  }

  protected daysDown(event: PointerEvent, dayIndex: number): void {
    if (event.button !== 0) return;
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
