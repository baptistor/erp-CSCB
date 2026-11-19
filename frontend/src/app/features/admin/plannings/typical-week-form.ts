import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
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
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { map } from 'rxjs';
import { Api } from '../../../api/api';
import { getUsers, getUserSchedule, updateUserSchedule } from '../../../api/functions';
import { UserSchedule, UserSummary } from '../../../api/models';
import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../shared/dates';
import { DAY_LABELS, isValidMinHours, rangeError } from '../../../shared/schedule-rules';
import { fullName } from '../../../shared/user-color';

type DayGroup = FormGroup<{
  worked: FormControl<boolean>;
  startTime: FormControl<string>;
  endTime: FormControl<string>;
}>;

/** Chaque jour travaillé doit respecter la plage et le minimum (erreurs indexées par jour). */
export const weekValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const min = control.get('minDailyHours')?.value as number | null;
  if (!isValidMinHours(min)) return { min: 'Minimum entre 0,25 et 24 h, par pas de 0,25 h' };
  const days = (control.get('days') as FormArray<DayGroup>).getRawValue();
  const errors: Record<number, string> = {};
  days.forEach((day, i) => {
    if (!day.worked) return;
    const error = rangeError(day.startTime, day.endTime, min);
    if (error) errors[i] = error;
  });
  return Object.keys(errors).length ? { days: errors } : null;
};

/**
 * Semaine type + minimum d'heures. Admin : choix de l'employé, minimum modifiable.
 * [selfOnly] (employé) : ses propres horaires, minimum en lecture seule (spec §1).
 */
@Component({
  selector: 'app-typical-week-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
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
          <mat-label>Minimum d'heures par jour travaillé</mat-label>
          <input matInput type="number" step="0.25" min="0.25" max="24" formControlName="minDailyHours" />
          <span matTextSuffix>h</span>
          @if (selfOnly()) {
            <mat-hint>Modifiable uniquement par un admin</mat-hint>
          }
        </mat-form-field>
        @if (errors()?.['min']; as error) {
          <p class="error">{{ error }}</p>
        }

        <table class="week" formArrayName="days">
          <thead>
            <tr><th>Jour</th><th>Travaillé</th><th>Début</th><th>Fin</th><th></th></tr>
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
                <td class="error">{{ errors()?.['days']?.[i] }}</td>
              </tr>
            }
          </tbody>
        </table>

        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">Enregistrer</button>
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
    .error { color: var(--mat-sys-error); font: var(--mat-sys-body-small); }
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
  protected readonly labels = DAY_LABELS;
  protected readonly name = fullName;

  protected readonly form = this.fb.group(
    {
      minDailyHours: this.fb.control<number | null>(8),
      days: this.fb.array(DAY_LABELS.map(() => this.dayGroup())),
    },
    { validators: weekValidator },
  );

  /** Erreurs du formulaire, recalculées à chaque changement (ex. { min: '…' } ou { days: { 0: '…' } }). */
  protected readonly errors = toSignal(this.form.statusChanges.pipe(map(() => this.form.errors)), {
    initialValue: null as ValidationErrors | null,
  });

  ngOnInit(): void {
    const me = this.auth.currentUser();
    if (this.selfOnly()) {
      this.form.controls.minDailyHours.disable();
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
          minDailyHours: value.minDailyHours!,
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
    this.form.controls.minDailyHours.setValue(schedule.minDailyHours);
    schedule.days.forEach((day) => {
      this.form.controls.days.at(day.dayOfWeek - 1).setValue({
        worked: day.startTime != null,
        startTime: day.startTime ?? '09:00',
        endTime: day.endTime ?? '17:00',
      });
    });
    this.form.markAsPristine();
  }

  private dayGroup(): DayGroup {
    return this.fb.group({ worked: [false], startTime: ['09:00'], endTime: ['17:00'] });
  }
}
