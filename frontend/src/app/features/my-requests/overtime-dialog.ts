import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogImports, ZardDialogRef } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardInputGroupImports } from '@/shared/components/input-group';
import { ZardTextareaComponent } from '@/shared/components/textarea';
import { OvertimeInput } from '../../api/models';
import { toIsoDate } from '../../shared/dates';
import { quarterHoursValidator } from '../../shared/requests';

/** « Déclarer des heures » : date, nombre d'heures (pas de 0,25), motif (spec §2). */
@Component({
  selector: 'app-overtime-dialog',
  imports: [ReactiveFormsModule, ZardButtonComponent, ZardDialogImports, ZardFieldImports, ZardInputComponent, ZardInputGroupImports, ZardTextareaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-dialog-header>
      <z-dialog-title>Déclarer des heures supplémentaires</z-dialog-title>
      <z-dialog-description>Elles seront ajoutées à votre solde une fois validées par un admin.</z-dialog-description>
    </z-dialog-header>
    <form class="flex flex-col gap-5" [formGroup]="form" (ngSubmit)="save()">
      <z-field>
        <label z-field-label for="ot-date">Date</label>
        <input z-input id="ot-date" type="date" formControlName="date" />
      </z-field>
      <z-field>
        <label z-field-label for="ot-hours">Nombre d'heures</label>
        <z-input-group>
          <input z-input id="ot-hours" type="number" step="0.25" min="0.25" max="24" placeholder="ex. 1,5" formControlName="hours"
                 [attr.aria-invalid]="form.controls.hours.hasError('quarterHours') || null" />
          <z-input-group-addon zAlign="inline-end"><span z-input-group-text>h</span></z-input-group-addon>
        </z-input-group>
        @if (form.controls.hours.hasError('quarterHours')) {
          <z-field-error>Entre 0,25 et 24 h, par pas de 0,25 h</z-field-error>
        }
      </z-field>
      <z-field>
        <label z-field-label for="ot-reason">Motif</label>
        <textarea z-textarea id="ot-reason" rows="3" placeholder="ex. réunion de parents tardive" formControlName="reason"></textarea>
      </z-field>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" z-dialog-close>Annuler</button>
        <button z-button type="submit" [disabled]="form.invalid">Envoyer la demande</button>
      </z-dialog-footer>
    </form>
  `,
})
export class OvertimeDialog {
  private readonly ref = inject<ZardDialogRef<OvertimeDialog, OvertimeInput>>(ZardDialogRef);
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
