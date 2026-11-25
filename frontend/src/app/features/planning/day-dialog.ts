import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SpecialDayInput, UserSummary } from '../../api/models';
import { extraError, formatMinutes, toMinutes, WorkedRange } from '../../shared/schedule-rules';
import { fullName } from '../../shared/user-color';

export interface DayDialogData {
  user: UserSummary;
  initial: { date: string; startTime: string; endTime: string };
  /** Plage ajoutée existante : la date n'est plus modifiable, la plage peut être retirée. */
  existing?: boolean;
  /** Date imposée (jour sélectionné sur le planning). */
  lockDate?: boolean;
  /** Journée type et autres heures déjà ajoutées à une date (vides si inconnues : le serveur vérifie). */
  dayOf: (date: string) => { typical: WorkedRange[]; others: WorkedRange[] };
}

export type DayDialogResult = { action: 'save'; input: SpecialDayInput } | { action: 'remove' };

/** « Ajouter des heures » à un jour, en dehors de la journée type et de la pause de midi (spec §1). */
@Component({
  selector: 'app-day-dialog',
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.existing ? 'Heures ajoutées' : 'Ajouter des heures' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <p class="info">
          {{ name }} — journée type :
          <strong>{{ typicalText() }}</strong>.
          Pensez à déclarer ces heures dans « Mes demandes ».
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput type="date" formControlName="date" />
        </mat-form-field>
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
        @if (error()) {
          <p class="error">{{ error() }}</p>
        } @else {
          <p class="added">+ {{ added() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (data.existing) {
          <button mat-button type="button" class="remove" (click)="remove()">Retirer ces heures</button>
        }
        <span class="spacer"></span>
        <button mat-button type="button" mat-dialog-close>Annuler</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid || error() !== null">Enregistrer</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields { display: flex; flex-direction: column; min-width: min(380px, 80vw); padding-top: 8px; }
    .row { display: flex; gap: 12px; }
    .row mat-form-field { flex: 1; }
    .info { color: var(--mat-sys-on-surface-variant); margin: 0 0 12px; font: var(--mat-sys-body-small); }
    .added { margin: 0; font: var(--mat-sys-title-small); }
    .error { color: var(--mat-sys-error); margin: 0; }
    .spacer { flex: 1; }
    .remove { color: var(--mat-sys-error); }
  `,
})
export class DayDialog {
  protected readonly data = inject<DayDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DayDialog, DayDialogResult>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly name = fullName(this.data.user);
  protected readonly form = this.fb.group({
    date: [{ value: this.data.initial.date, disabled: !!(this.data.existing || this.data.lockDate) }, Validators.required],
    startTime: [this.data.initial.startTime, Validators.required],
    endTime: [this.data.initial.endTime, Validators.required],
  });

  private readonly changes = toSignal(this.form.valueChanges);
  private readonly value = computed(() => {
    this.changes();
    return this.form.getRawValue();
  });
  protected readonly day = computed(() => this.data.dayOf(this.value().date));
  protected readonly typicalText = computed(
    () => this.day().typical.map((t) => `${t.start}–${t.end}`).join(' / ') || 'non travaillée',
  );
  protected readonly error = computed(() =>
    extraError({ start: this.value().startTime, end: this.value().endTime }, this.day().typical, this.day().others),
  );
  protected readonly added = computed(() =>
    formatMinutes(toMinutes(this.value().endTime) - toMinutes(this.value().startTime)),
  );

  protected save(): void {
    if (this.form.invalid || this.error()) return;
    this.ref.close({ action: 'save', input: { userId: this.data.user.id, ...this.form.getRawValue() } });
  }

  protected remove(): void {
    this.ref.close({ action: 'remove' });
  }
}
