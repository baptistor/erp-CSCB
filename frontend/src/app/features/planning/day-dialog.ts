import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Api } from '../../api/api';
import { getUserSchedule } from '../../api/functions';
import { SpecialDayInput, UserSummary } from '../../api/models';
import { formatMinutes, rangeError } from '../../shared/schedule-rules';
import { fullName } from '../../shared/user-color';

export interface DayDialogData {
  users: UserSummary[];
  /** Valeurs initiales (journée cliquée ou sélection). */
  initial: { userId?: number; date: string; startTime?: string | null; endTime?: string | null };
  /** Journée existante : l'employé et la date ne sont plus modifiables. */
  existing?: { specialDayId: number | null };
  /** Employé imposé (un employé ne crée que ses propres journées). */
  lockUser?: boolean;
}

export type DayDialogResult = { action: 'save'; input: SpecialDayInput } | { action: 'reset' };

/** Validateur de groupe : si « travaillé », plage valide et durée ≥ minimum. */
export function workedDayValidator(minHours: () => number | null): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    if (!group.get('worked')?.value) return null;
    const error = rangeError(group.get('startTime')?.value, group.get('endTime')?.value, minHours());
    return error ? { range: error } : null;
  };
}

@Component({
  selector: 'app-day-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.existing ? 'Modifier la journée' : 'Nouvelle journée spéciale' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <p class="info">
          Une journée spéciale remplace la journée type de l'employé pour cette date.
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Employé</mat-label>
          <mat-select formControlName="userId">
            @for (user of data.users; track user.id) {
              <mat-option [value]="user.id">{{ name(user) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput type="date" formControlName="date" />
        </mat-form-field>
        <mat-checkbox formControlName="worked">Jour travaillé</mat-checkbox>
        @if (worked()) {
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>Début</mat-label>
              <input matInput type="time" step="900" formControlName="startTime" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Fin</mat-label>
              <input matInput type="time" step="900" formControlName="endTime" />
            </mat-form-field>
          </div>
          @if (minHours() != null) {
            <p class="hint">Minimum pour cet employé : {{ formatHours(minHours()!) }}</p>
          }
        }
        @if (form.errors?.['range']; as error) {
          <p class="error">{{ error }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (data.existing?.specialDayId) {
          <button mat-button type="button" class="reset" (click)="reset()">Revenir à la journée type</button>
        }
        <span class="spacer"></span>
        <button mat-button type="button" mat-dialog-close>Annuler</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid">Enregistrer</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields { display: flex; flex-direction: column; min-width: min(380px, 80vw); padding-top: 8px; }
    .row { display: flex; gap: 12px; margin-top: 12px; }
    .row mat-form-field { flex: 1; }
    .info, .hint { color: var(--mat-sys-on-surface-variant); margin: 0 0 12px; font: var(--mat-sys-body-small); }
    .hint { margin: 0; }
    .error { color: var(--mat-sys-error); margin: 8px 0 0; }
    .spacer { flex: 1; }
    .reset { color: var(--mat-sys-error); }
  `,
})
export class DayDialog {
  protected readonly data = inject<DayDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DayDialog, DayDialogResult>>(MatDialogRef);
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly minHours = signal<number | null>(null);

  protected readonly form = this.fb.group(
    {
      userId: this.fb.control<number | null>(this.data.initial.userId ?? null, Validators.required),
      date: [this.data.initial.date, Validators.required],
      worked: [this.data.initial.startTime != null || !this.data.existing],
      startTime: [this.data.initial.startTime ?? '09:00'],
      endTime: [this.data.initial.endTime ?? '17:00'],
    },
    { validators: workedDayValidator(() => this.minHours()) },
  );

  protected readonly worked = toSignal(this.form.controls.worked.valueChanges, {
    initialValue: this.form.controls.worked.value,
  });

  protected readonly name = fullName;
  protected readonly formatHours = (hours: number) => formatMinutes(hours * 60);

  constructor() {
    if (this.data.existing) {
      this.form.controls.userId.disable();
      this.form.controls.date.disable();
    }
    if (this.data.lockUser) {
      this.form.controls.userId.disable();
    }
    this.form.controls.userId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => void this.loadMinHours(id));
    void this.loadMinHours(this.form.controls.userId.value);
  }

  private async loadMinHours(userId: number | null): Promise<void> {
    this.minHours.set(null);
    if (userId == null) return;
    try {
      const schedule = await this.api.invoke(getUserSchedule, { userId });
      this.minHours.set(schedule.minDailyHours);
    } catch {
      // le serveur validera de toute façon
    }
    this.form.updateValueAndValidity();
  }

  protected save(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.ref.close({
      action: 'save',
      input: {
        userId: value.userId!,
        date: value.date,
        startTime: value.worked ? value.startTime : null,
        endTime: value.worked ? value.endTime : null,
      },
    });
  }

  protected reset(): void {
    this.ref.close({ action: 'reset' });
  }
}
