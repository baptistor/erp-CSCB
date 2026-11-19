import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { map, startWith } from 'rxjs';
import { Api } from '../../../api/api';
import { getUsers, getUserSchedule, updateUserSchedule } from '../../../api/functions';
import { UserSchedule, UserSummary } from '../../../api/models';
import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../shared/dates';
import {
  contractStatus,
  DAY_LABELS,
  formatMinutes,
  isValidWeeklyHours,
  rangeError,
  toMinutes,
} from '../../../shared/schedule-rules';
import { fullName } from '../../../shared/user-color';

type DayGroup = FormGroup<{
  worked: FormControl<boolean>;
  startTime: FormControl<string>;
  endTime: FormControl<string>;
}>;

/** Durée d'un jour de la semaine type, en minutes (0 si non travaillé ou plage invalide). */
export function dayMinutes(day: { worked: boolean; startTime: string; endTime: string }): number {
  if (!day.worked || rangeError(day.startTime, day.endTime)) return 0;
  return toMinutes(day.endTime) - toMinutes(day.startTime);
}

/**
 * Semaine type valide (spec §1) : contrat au pas de 0,25 h, chaque jour travaillé fin > début, et total exactement
 * égal au contrat (sinon erreur `contract`, l'enregistrement n'est possible qu'au vert).
 */
export const weekValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const weekly = control.get('weeklyHours')?.value as number | null;
  if (!isValidWeeklyHours(weekly)) return { weekly: 'Contrat entre 0,25 et 168 h, par pas de 0,25 h' };
  const days = (control.get('days') as FormArray<DayGroup>).getRawValue();
  const errors: Record<number, string> = {};
  days.forEach((day, i) => {
    if (!day.worked) return;
    const error = rangeError(day.startTime, day.endTime);
    if (error) errors[i] = error;
  });
  if (Object.keys(errors).length) return { days: errors };
  const status = contractStatus(days.reduce((sum, day) => sum + dayMinutes(day), 0), weekly!);
  return status.kind === 'ok' ? null : { contract: status.kind };
};

/**
 * Semaine type + contrat hebdomadaire (spec §1). Admin : choix de l'employé, contrat modifiable.
 * [selfOnly] (employé) : ses propres horaires, contrat en lecture seule. Indicateur permanent vert / rouge / orange.
 */
@Component({
  selector: 'app-typical-week-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
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
        @if (errors()?.['weekly']; as error) {
          <p class="error">{{ error }}</p>
        }

        @if (status(); as st) {
          <div class="contract" [attr.data-kind]="st.kind" role="status" aria-live="polite">
            <mat-icon>{{ st.kind === 'ok' ? 'check_circle' : st.kind === 'under' ? 'cancel' : 'warning' }}</mat-icon>
            <span>{{ st.message }}</span>
          </div>
        }

        <table class="week" formArrayName="days">
          <thead>
            <tr><th>Jour</th><th>Travaillé</th><th>Début</th><th>Fin</th><th class="num">Durée</th><th></th></tr>
          </thead>
          <tbody>
            @for (day of form.controls.days.controls; track $index; let i = $index) {
              <tr [formGroupName]="i">
                <td>{{ labels[i] }}</td>
                <td><mat-checkbox formControlName="worked" [aria-label]="labels[i] + ' travaillé'" /></td>
                @if (day.controls.worked.value) {
                  <td><input class="time" type="time" step="900" formControlName="startTime" [attr.aria-label]="labels[i] + ' début'" /></td>
                  <td><input class="time" type="time" step="900" formControlName="endTime" [attr.aria-label]="labels[i] + ' fin'" /></td>
                } @else {
                  <td colspan="2" class="off">Non travaillé</td>
                }
                <td class="num">{{ durations()[i] ? duration(durations()[i]) : '—' }}</td>
                <td class="error">{{ errors()?.['days']?.[i] }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr><td colspan="4" class="total-label">Total de la semaine</td>
              <td class="num total">{{ duration(total()) }}</td><td></td></tr>
          </tfoot>
        </table>

        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">Enregistrer</button>
          @if (status()?.kind !== 'ok') {
            <span class="hint">L'enregistrement n'est possible que lorsque le contrat est respecté.</span>
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
  /** Employé choisi (mode admin), pour afficher ses horaires modifiés à venir à côté. */
  readonly userChange = output<number>();

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly userId = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly labels = DAY_LABELS;
  protected readonly name = fullName;

  protected readonly form = this.fb.group(
    {
      weeklyHours: this.fb.control<number | null>(35),
      days: this.fb.array(DAY_LABELS.map(() => this.dayGroup())),
    },
    { validators: weekValidator },
  );

  /** Erreurs du formulaire, recalculées à chaque changement (ex. { min: '…' } ou { days: { 0: '…' } }). */
  protected readonly errors = toSignal(this.form.statusChanges.pipe(map(() => this.form.errors)), {
    initialValue: null as ValidationErrors | null,
  });

  /** Valeurs du formulaire en continu (pour l'indicateur et les durées, recalculés à chaque frappe). */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly durations = computed(() => this.value().days.map((day) => dayMinutes(day)));
  protected readonly total = computed(() => this.durations().reduce((sum, m) => sum + m, 0));
  protected readonly status = computed(() => {
    const weekly = this.value().weeklyHours;
    return isValidWeeklyHours(weekly) ? contractStatus(this.total(), weekly!) : null;
  });
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
    this.userChange.emit(userId);
    this.loaded.set(false);
    try {
      this.fill(await this.api.invoke(getUserSchedule, { userId }));
      this.loaded.set(true);
    } catch (error) {
      this.snack.open(errorMessage(error, 'Impossible de charger les horaires'), 'OK', { duration: 5000 });
    }
  }

  protected async save(): Promise<void> {
    const userId = this.userId();
    if (userId == null || this.form.invalid) return;
    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      const saved = await this.api.invoke(updateUserSchedule, {
        userId,
        body: {
          weeklyHours: value.weeklyHours!,
          days: value.days.map((day, i) => ({
            dayOfWeek: i + 1,
            startTime: day.worked ? day.startTime : null,
            endTime: day.worked ? day.endTime : null,
          })),
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

  private fill(schedule: UserSchedule): void {
    this.form.controls.weeklyHours.setValue(schedule.weeklyHours);
    schedule.days.forEach((day) => {
      this.form.controls.days.at(day.dayOfWeek - 1).setValue({
        worked: day.startTime != null,
        startTime: day.startTime ?? '09:00',
        endTime: day.endTime ?? '16:00',
      });
    });
    this.form.markAsPristine();
  }

  private dayGroup(): DayGroup {
    return this.fb.group({ worked: [false], startTime: ['09:00'], endTime: ['16:00'] });
  }
}
