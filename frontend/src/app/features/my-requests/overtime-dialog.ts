import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { OvertimeInput } from '../../api/models';
import { toIsoDate } from '../../shared/dates';
import { quarterHoursValidator } from '../../shared/requests';

/** « Déclarer des heures » : date, nombre d'heures (pas de 0,25), motif (spec §2). */
@Component({
  selector: 'app-overtime-dialog',
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Déclarer des heures supplémentaires</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput type="date" formControlName="date" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Nombre d'heures</mat-label>
          <input matInput type="number" step="0.25" min="0.25" max="24" formControlName="hours" />
          <span matTextSuffix>h</span>
          @if (form.controls.hours.hasError('quarterHours')) {
            <mat-error>Entre 0,25 et 24 h, par pas de 0,25 h</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Motif</mat-label>
          <textarea matInput rows="3" formControlName="reason"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Annuler</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid">Envoyer la demande</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.fields { display: flex; flex-direction: column; min-width: min(380px, 80vw); padding-top: 8px; }`,
})
export class OvertimeDialog {
  private readonly ref = inject<MatDialogRef<OvertimeDialog, OvertimeInput>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    date: [toIsoDate(new Date()), Validators.required],
    hours: this.fb.control<number | null>(null, [Validators.required, quarterHoursValidator(24)]),
    reason: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  protected save(): void {
    if (this.form.invalid) return;
    const { date, hours, reason } = this.form.getRawValue();
    this.ref.close({ date, hours: hours!, reason: reason.trim() });
  }
}
