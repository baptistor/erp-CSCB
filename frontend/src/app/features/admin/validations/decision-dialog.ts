import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface DecisionDialogData {
  approved: boolean;
  summary: string;
}

/** Confirmation d'une décision admin, avec commentaire optionnel (transmis au demandeur). */
@Component({
  selector: 'app-decision-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.approved ? 'Approuver' : 'Refuser' }} la demande</h2>
    <mat-dialog-content class="fields">
      <p>{{ data.summary }}</p>
      <mat-form-field appearance="outline">
        <mat-label>Commentaire (facultatif)</mat-label>
        <textarea matInput rows="3" [(ngModel)]="comment"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annuler</button>
      <button mat-flat-button [class.reject]="!data.approved" (click)="confirm()">
        {{ data.approved ? 'Approuver' : 'Refuser' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .fields { display: flex; flex-direction: column; min-width: min(400px, 80vw); }
    .reject { background: var(--mat-sys-error); color: var(--mat-sys-on-error); }
  `,
})
export class DecisionDialog {
  protected readonly data = inject<DecisionDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DecisionDialog, { comment: string | null }>>(MatDialogRef);
  protected comment = '';

  protected confirm(): void {
    this.ref.close({ comment: this.comment.trim() || null });
  }
}
