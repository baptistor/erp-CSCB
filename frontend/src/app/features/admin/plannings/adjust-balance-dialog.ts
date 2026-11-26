import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ZardButtonComponent } from '@/shared/components/button';
import { injectDialogData, ZardDialogImports, ZardDialogRef } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardInputGroupImports } from '@/shared/components/input-group';
import { AdjustmentInput } from '../../../api/models';
import { quarterHoursValidator } from '../../../shared/requests';

export interface AdjustBalanceDialogData {
  name: string;
}

/** Ajustement manuel du solde d'un employé : ± heures (pas de 0,25) et motif. */
@Component({
  selector: 'app-adjust-balance-dialog',
  imports: [ReactiveFormsModule, ZardButtonComponent, ZardDialogImports, ZardFieldImports, ZardInputComponent, ZardInputGroupImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-dialog-header>
      <z-dialog-title>Ajuster le solde</z-dialog-title>
      <z-dialog-description>{{ data.name }} — ajoutez ou retirez des heures, par exemple pour reprendre un solde existant.</z-dialog-description>
    </z-dialog-header>
    <form class="flex flex-col gap-5" [formGroup]="form" (ngSubmit)="save()">
      <z-field>
        <label z-field-label for="adjust-hours">Heures (+ ou −)</label>
        <z-input-group>
          <input z-input id="adjust-hours" type="number" step="0.25" placeholder="ex. 2,5 ou -1" formControlName="hours"
                 [attr.aria-invalid]="form.controls.hours.hasError('quarterHours') || null" />
          <z-input-group-addon zAlign="inline-end"><span z-input-group-text>h</span></z-input-group-addon>
        </z-input-group>
        @if (form.controls.hours.hasError('quarterHours')) {
          <z-field-error>Non nul, par pas de 0,25 h</z-field-error>
        }
      </z-field>
      <z-field>
        <label z-field-label for="adjust-reason">Motif</label>
        <input z-input id="adjust-reason" formControlName="reason" placeholder="ex. reprise du solde existant" />
        <p z-field-description>Visible par l'employé dans l'historique de son solde.</p>
      </z-field>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" z-dialog-close>Annuler</button>
        <button z-button type="submit" [disabled]="form.invalid">Enregistrer</button>
      </z-dialog-footer>
    </form>
  `,
})
export class AdjustBalanceDialog {
  protected readonly data = injectDialogData<AdjustBalanceDialogData>();
  private readonly ref = inject<ZardDialogRef<AdjustBalanceDialog, AdjustmentInput>>(ZardDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    hours: this.fb.control<number | null>(null, [Validators.required, quarterHoursValidator(999, true)]),
    reason: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  protected save(): void {
    if (this.form.invalid) return;
    const { hours, reason } = this.form.getRawValue();
    this.ref.close({ hours: hours!, reason: reason.trim() });
  }
}
