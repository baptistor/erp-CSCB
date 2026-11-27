import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { formatHours } from '../../shared/requests';

export interface OvertimeDialogData {
  /** Récapitulatif lisible, ex. « vendredi 27 novembre 2026 de 18:00 à 20:00 ». */
  summary: string;
  hours: number;
  /** ADMIN : nom de l'employé pour qui les heures sont posées (acceptées directement). */
  forName?: string;
}

/** Validation d'une plage d'heures sup posée sur le planning (spec §2) : récap + motif obligatoire. */
@Component({
  selector: 'app-overtime-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      {{ data.forName ? 'Ajouter des heures sup pour ' + data.forName : 'Demander des heures supplémentaires' }}
    </h2>
    <mat-dialog-content class="fields">
      <p class="summary">{{ data.summary }} — <strong>{{ hoursText }}</strong></p>
      <p class="info">
        @if (data.forName) {
          Saisies par l'admin : elles sont acceptées directement et s'ajoutent à son solde.
        } @else {
          La demande est envoyée à l'admin ; une fois acceptée, les heures s'ajoutent à votre solde.
        }
      </p>
      <mat-form-field appearance="outline">
        <mat-label>Motif</mat-label>
        <textarea matInput rows="3" required [(ngModel)]="reason" cdkFocusInitial></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Annuler</button>
      <button mat-flat-button type="button" [disabled]="!reason.trim()" (click)="send()">
        {{ data.forName ? 'Ajouter' : 'Envoyer la demande' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .fields { display: flex; flex-direction: column; gap: 8px; min-width: min(420px, 80vw); }
    .summary { margin: 0; }
    .info { margin: 0 0 8px; color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
  `,
})
export class OvertimeDialog {
  protected readonly data = inject<OvertimeDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<OvertimeDialog, string>>(MatDialogRef);
  protected readonly hoursText = formatHours(this.data.hours);
  protected reason = '';

  protected send(): void {
    if (this.reason.trim()) this.ref.close(this.reason.trim());
  }
}
