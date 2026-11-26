import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ZardButtonComponent } from '@/shared/components/button';
import { injectDialogData, ZardDialogImports, ZardDialogRef } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
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
  imports: [ReactiveFormsModule, ZardButtonComponent, ZardDialogImports, ZardFieldImports, ZardInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-dialog-header>
      <z-dialog-title>{{ data.existing ? 'Heures ajoutées' : 'Ajouter des heures' }}</z-dialog-title>
      <z-dialog-description>
        {{ name }} — journée type : <strong>{{ typicalText() }}</strong>.
        Pensez à déclarer ces heures dans « Mes demandes ».
      </z-dialog-description>
    </z-dialog-header>
    <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="save()">
      <z-field>
        <label z-field-label for="day-date">Date</label>
        <input z-input id="day-date" type="date" formControlName="date" />
      </z-field>
      <div class="flex gap-3">
        <z-field class="flex-1">
          <label z-field-label for="day-start">Début</label>
          <input z-input id="day-start" type="time" step="900" formControlName="startTime" />
        </z-field>
        <z-field class="flex-1">
          <label z-field-label for="day-end">Fin</label>
          <input z-input id="day-end" type="time" step="900" formControlName="endTime" />
        </z-field>
      </div>
      @if (error()) {
        <p class="text-sm text-destructive">{{ error() }}</p>
      } @else {
        <p class="text-sm font-medium">+ {{ added() }}</p>
      }
      <z-dialog-footer>
        @if (data.existing) {
          <button z-button zType="destructive" type="button" class="sm:mr-auto" (click)="remove()">
            Retirer ces heures
          </button>
        }
        <button z-button zType="outline" type="button" z-dialog-close>Annuler</button>
        <button z-button type="submit" [disabled]="form.invalid || error() !== null">Enregistrer</button>
      </z-dialog-footer>
    </form>
  `,
})
export class DayDialog {
  protected readonly data = injectDialogData<DayDialogData>();
  private readonly ref = inject<ZardDialogRef<DayDialog, DayDialogResult>>(ZardDialogRef);
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
