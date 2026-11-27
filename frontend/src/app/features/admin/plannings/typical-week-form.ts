import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { map, startWith } from 'rxjs';
import { Api } from '../../../api/api';
import { getUsers, getUserSchedule, updateUserSchedule } from '../../../api/functions';
import { TypicalDay, UserSchedule, UserSummary } from '../../../api/models';
import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../shared/dates';
import {
  BREAK,
  contractStatus,
  DAY_LABELS,
  formatMinutes,
  isValidWeeklyHours,
  rangeError,
  toMinutes,
} from '../../../shared/schedule-rules';
import { fullName } from '../../../shared/user-color';

type DayGroup = FormGroup<{
  morning: FormControl<boolean>;
  morningStart: FormControl<string>;
  morningEnd: FormControl<string>;
  afternoon: FormControl<boolean>;
  afternoonStart: FormControl<string>;
  afternoonEnd: FormControl<string>;
}>;

export interface DayValue {
  morning: boolean;
  morningStart: string;
  morningEnd: string;
  afternoon: boolean;
  afternoonStart: string;
  afternoonEnd: string;
}

type Week = 'classic' | 'holiday';


/** Le centre est fermé le dimanche : il n'apparaît pas (envoyé non travaillé). */
const OPEN_DAYS = DAY_LABELS.slice(0, 6);

/**
 * Erreur d'un jour (spec §1) : fin > début ; semaine classique : matin fini à 12:30 au plus tard, après-midi à partir de
 * 13:30 ; semaine de vacances : une seule plage (champs « matin »), sans pause.
 */
export function dayError(day: DayValue, holiday = false): string | null {
  if (holiday) return day.morning ? rangeError(day.morningStart, day.morningEnd) : null;
  if (day.morning) {
    const error = rangeError(day.morningStart, day.morningEnd);
    if (error) return `Matin : ${error}`;
    if (day.morningEnd > BREAK.start) return 'Le matin doit finir au plus tard à 12:30 (pause de midi)';
  }
  if (day.afternoon) {
    const error = rangeError(day.afternoonStart, day.afternoonEnd);
    if (error) return `Après-midi : ${error}`;
    if (day.afternoonStart < BREAK.end) return "L'après-midi doit commencer au plus tôt à 13:30 (pause de midi)";
  }
  return null;
}

/** Durée d'un jour de la semaine type, en minutes, hors pause (0 si non travaillé ou invalide). */
export function dayMinutes(day: DayValue, holiday = false): number {
  if (dayError(day, holiday)) return 0;
  return (
    (day.morning ? toMinutes(day.morningEnd) - toMinutes(day.morningStart) : 0) +
    (!holiday && day.afternoon ? toMinutes(day.afternoonEnd) - toMinutes(day.afternoonStart) : 0)
  );
}

/** Semaine valide : chaque jour valide, et total exactement égal au contrat. */
export function weekOk(days: DayValue[], weeklyHours: number | null, holiday = false): boolean {
  if (!isValidWeeklyHours(weeklyHours) || days.some((d) => dayError(d, holiday))) return false;
  return contractStatus(days.reduce((sum, d) => sum + dayMinutes(d, holiday), 0), weeklyHours!).kind === 'ok';
}

/**
 * Semaines type (classique et vacances scolaires) + contrat hebdomadaire commun (spec §1). Admin : choix de l'employé,
 * contrat modifiable. [selfOnly] (employé) : ses propres horaires, contrat en lecture seule. Indicateur permanent
 * vert / rouge / orange.
 */
@Component({
  selector: 'app-typical-week-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!selfOnly()) {
      <mat-form-field appearance="outline" class="user">
        <mat-label>Employé</mat-label>
        <mat-select [value]="userId()" (valueChange)="select($event)">
          @for (user of users(); track user.id) {
            <mat-option [value]="user.id">{{ name(user) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    }

    @if (userId() != null && loaded()) {
      <form [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="min">
          <mat-label>Contrat hebdomadaire</mat-label>
          <input matInput type="number" step="0.25" min="0.25" max="168" formControlName="weeklyHours" />
          <span matTextSuffix>h / semaine</span>
          @if (selfOnly()) {
            <mat-hint>Modifiable uniquement par un admin</mat-hint>
          }
        </mat-form-field>
        @if (!weeklyValid()) {
          <p class="error">Contrat entre 0,25 et 168 h, par pas de 0,25 h</p>
        }

        <mat-button-toggle-group class="weeks" [value]="week()" (change)="show($event.value)" aria-label="Type de semaine">
          <mat-button-toggle value="classic">Semaine classique</mat-button-toggle>
          <mat-button-toggle value="holiday">Vacances scolaires</mat-button-toggle>
        </mat-button-toggle-group>
        @if (week() === 'holiday') {
          <p class="hint">Pas de pause de midi en semaine de vacances : une seule plage par jour.</p>
        }

        @if (status(); as st) {
          <div class="contract" [attr.data-kind]="st.kind" role="status" aria-live="polite">
            <mat-icon>{{ st.kind === 'ok' ? 'check_circle' : st.kind === 'under' ? 'cancel' : 'warning' }}</mat-icon>
            <span>{{ st.message }}</span>
          </div>
        }

        <table class="week">
          <thead>
            @if (week() === 'holiday') {
              <tr><th>Jour</th><th>Horaires (sans pause)</th><th class="num">Durée</th><th></th></tr>
            } @else {
              <tr><th>Jour</th><th>Matin (jusqu'à 12:30)</th><th>Après-midi (dès 13:30)</th><th class="num">Durée</th><th></th></tr>
            }
          </thead>
          <tbody>
            @for (day of form.controls[week()].controls; track day; let i = $index) {
              @if (i < labels.length) {
              <tr [formGroup]="day">
                <td>{{ labels[i] }}</td>
                <td>
                  <mat-checkbox formControlName="morning" [aria-label]="labels[i] + (week() === 'holiday' ? ' travaillé' : ' matin travaillé')" />
                  @if (day.controls.morning.value) {
                    <input class="time" type="time" step="900" formControlName="morningStart" [attr.aria-label]="labels[i] + ' matin début'" />
                    –
                    <input class="time" type="time" step="900" formControlName="morningEnd" [attr.aria-label]="labels[i] + ' matin fin'" />
                  } @else {
                    <span class="off">Non travaillé</span>
                  }
                </td>
                @if (week() === 'classic') {
                <td>
                  <mat-checkbox formControlName="afternoon" [aria-label]="labels[i] + ' après-midi travaillé'" />
                  @if (day.controls.afternoon.value) {
                    <input class="time" type="time" step="900" formControlName="afternoonStart" [attr.aria-label]="labels[i] + ' après-midi début'" />
                    –
                    <input class="time" type="time" step="900" formControlName="afternoonEnd" [attr.aria-label]="labels[i] + ' après-midi fin'" />
                  } @else {
                    <span class="off">Non travaillé</span>
                  }
                </td>
                }
                <td class="num">{{ durations()[i] ? duration(durations()[i]) : '—' }}</td>
                <td class="error">{{ dayErrors()[i] }}</td>
              </tr>
              }
            }
          </tbody>
          <tfoot>
            <tr><td [attr.colspan]="week() === 'holiday' ? 2 : 3" class="total-label">Total de la semaine{{ week() === 'classic' ? ' (pause non comptée)' : '' }}</td>
              <td class="num total">{{ duration(total()) }}</td><td></td></tr>
          </tfoot>
        </table>

        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="!canSave() || saving()">Enregistrer</button>
          @if (blocked(); as reason) {
            <span class="hint">{{ reason }}</span>
          }
        </div>
      </form>
    }
  `,
  styles: `
    :host { display: block; padding-top: 16px; }
    .user { width: 320px; max-width: 100%; }
    .min { width: 320px; max-width: 100%; display: block; }
    .week { border-collapse: collapse; margin: 8px 0 16px; }
    .week th { text-align: left; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); padding: 4px 12px 4px 0; }
    .week td { padding: 4px 12px 4px 0; height: 44px; }
    .time { font: var(--mat-sys-body-large); padding: 6px 8px; border: 1px solid var(--mat-sys-outline); border-radius: 4px; background: transparent; color: inherit; }
    .weeks { margin: 12px 0 0; }
    .off { color: var(--mat-sys-on-surface-variant); font-style: italic; }
    .actions { display: flex; align-items: center; gap: 12px; }
    .hint { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .error { color: var(--mat-sys-error); font: var(--mat-sys-body-small); }
    .num { text-align: right; white-space: nowrap; }
    .total-label, .total { font: var(--mat-sys-title-small); border-top: 1px solid var(--mat-sys-outline-variant); }
    /* indicateur du contrat : vert = respecté, rouge = il manque des heures, orange = heures en trop */
    .contract { display: flex; align-items: flex-start; gap: 8px; max-width: 720px; margin: 16px 0 8px;
      padding: 10px 14px; border-radius: 10px; font: var(--mat-sys-body-medium); border: 1px solid; }
    .contract mat-icon { flex: none; }
    .contract[data-kind='ok'] { color: #0d5a1f; background: #e6f4ea; border-color: #34a853; }
    .contract[data-kind='under'] { color: #8c1d18; background: #fce8e6; border-color: #d93025; }
    .contract[data-kind='over'] { color: #7a4100; background: #fef3e0; border-color: #f29900; }
  `,
})
export class TypicalWeekForm implements OnInit {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  /** Mode employé : ses propres horaires uniquement. */
  readonly selfOnly = input(false);

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly userId = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly labels = OPEN_DAYS;
  protected readonly name = fullName;

  protected readonly week = signal<Week>('classic');

  protected readonly form = this.fb.group({
    weeklyHours: this.fb.control<number | null>(35),
    classic: this.fb.array(DAY_LABELS.map(() => this.dayGroup())),
    holiday: this.fb.array(DAY_LABELS.map(() => this.dayGroup())),
  });

  /** Valeurs du formulaire en continu (pour l'indicateur et les durées, recalculés à chaque frappe). */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly weeklyValid = computed(() => isValidWeeklyHours(this.value().weeklyHours));
  private readonly shownDays = computed(() => this.value()[this.week()].slice(0, OPEN_DAYS.length));
  protected readonly durations = computed(() => this.shownDays().map((day) => dayMinutes(day, this.week() === 'holiday')));
  protected readonly dayErrors = computed(() => this.shownDays().map((day) => dayError(day, this.week() === 'holiday')));
  protected readonly total = computed(() => this.durations().reduce((sum, m) => sum + m, 0));
  protected readonly status = computed(() =>
    this.weeklyValid() ? contractStatus(this.total(), this.value().weeklyHours!) : null,
  );

  /** Raison qui empêche l'enregistrement (les deux semaines partagent le contrat), ou null. */
  protected readonly blocked = computed(() => {
    const { weeklyHours, classic, holiday } = this.value();
    if (!weekOk(classic, weeklyHours)) return 'La semaine classique doit respecter le contrat pour enregistrer.';
    if (!weekOk(holiday, weeklyHours, true)) {
      return 'La semaine de vacances doit respecter le contrat pour enregistrer.';
    }
    return null;
  });
  protected readonly canSave = computed(() => this.blocked() === null);
  protected readonly duration = formatMinutes;

  ngOnInit(): void {
    const me = this.auth.currentUser();
    if (this.selfOnly()) {
      this.form.controls.weeklyHours.disable();
      if (me) void this.select(me.id);
      return;
    }
    void this.api.invoke(getUsers).then((users) => {
      this.users.set(users);
      if (users.length) void this.select(users[0].id);
    });
  }

  protected async select(userId: number): Promise<void> {
    this.userId.set(userId);
    this.loaded.set(false);
    this.week.set('classic');
    try {
      this.fill(await this.api.invoke(getUserSchedule, { userId }));
      this.loaded.set(true);
    } catch (error) {
      this.snack.open(errorMessage(error, 'Impossible de charger les horaires'), 'OK', { duration: 5000 });
    }
  }

  protected show(week: Week): void {
    this.week.set(week);
  }

  protected async save(): Promise<void> {
    const userId = this.userId();
    if (userId == null || !this.canSave()) return;
    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      const saved = await this.api.invoke(updateUserSchedule, {
        userId,
        body: {
          weeklyHours: value.weeklyHours!,
          days: this.toDays(value.classic, false),
          holidayDays: this.toDays(value.holiday, true),
        },
      });
      this.fill(saved);
      this.snack.open('Horaires enregistrés', 'OK', { duration: 3000 });
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
    } finally {
      this.saving.set(false);
    }
  }

  /** Dimanche toujours non travaillé ; semaine de vacances : une seule plage (champs « matin »). */
  private toDays(days: DayValue[], holiday: boolean): TypicalDay[] {
    return days.map((day, i) => {
      const open = i < OPEN_DAYS.length;
      const morning = open && day.morning;
      const afternoon = open && !holiday && day.afternoon;
      return {
        dayOfWeek: i + 1,
        morningStart: morning ? day.morningStart : null,
        morningEnd: morning ? day.morningEnd : null,
        afternoonStart: afternoon ? day.afternoonStart : null,
        afternoonEnd: afternoon ? day.afternoonEnd : null,
      };
    });
  }

  private fill(schedule: UserSchedule): void {
    this.form.markAsPristine();
    this.form.controls.weeklyHours.setValue(schedule.weeklyHours);
    this.fillWeek('classic', schedule.days);
    this.fillWeek('holiday', schedule.holidayDays);
  }

  private fillWeek(week: Week, days: TypicalDay[]): void {
    days.forEach((day) => {
      this.form.controls[week].at(day.dayOfWeek - 1).setValue({
        morning: day.morningStart != null,
        morningStart: day.morningStart ?? '09:00',
        morningEnd: day.morningEnd ?? (week === 'holiday' ? '16:00' : '12:30'),
        afternoon: day.afternoonStart != null,
        afternoonStart: day.afternoonStart ?? '13:30',
        afternoonEnd: day.afternoonEnd ?? '17:00',
      });
    });
  }

  private dayGroup(): DayGroup {
    return this.fb.group({
      morning: [false],
      morningStart: ['09:00'],
      morningEnd: ['12:30'],
      afternoon: [false],
      afternoonStart: ['13:30'],
      afternoonEnd: ['17:00'],
    });
  }
}
