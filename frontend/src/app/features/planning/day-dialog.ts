import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { SpecialDayInput, UserSummary } from '../../api/models';
import { rangeError } from '../../shared/schedule-rules';
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

/** Validateur de groupe : si « travaillé », fin après début (pas de contrainte de durée, spec §1). */
export const workedDayValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  if (!group.get('worked')?.value) return null;
  const error = rangeError(group.get('startTime')?.value, group.get('endTime')?.value);
  return error ? { range: error } : null;
};

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
    <h2 mat-dialog-title>Horaires du jour</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <p class="info">
          Ces horaires ne s'appliquent qu'à cette date ; la semaine type ne change pas.
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
        }
        @if (form.errors?.['range']; as error) {
          <p class="error">{{ error }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (data.existing?.specialDayId) {
          <button mat-button type="button" class="reset" (click)="reset()">Remettre les horaires habituels</button>
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
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group(
    {
      userId: this.fb.control<number | null>(this.data.initial.userId ?? null, Validators.required),
      date: [this.data.initial.date, Validators.required],
      worked: [this.data.initial.startTime != null || !this.data.existing],
      startTime: [this.data.initial.startTime ?? '09:00'],
      endTime: [this.data.initial.endTime ?? '16:00'],
    },
    { validators: workedDayValidator },
  );

  protected readonly worked = toSignal(this.form.controls.worked.valueChanges, {
    initialValue: this.form.controls.worked.value,
  });

  protected readonly name = fullName;

  constructor() {
    if (this.data.existing) {
      this.form.controls.userId.disable();
      this.form.controls.date.disable();
    }
    if (this.data.lockUser) {
      this.form.controls.userId.disable();
    }
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
