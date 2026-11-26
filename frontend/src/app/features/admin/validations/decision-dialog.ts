import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ZardButtonComponent } from '@/shared/components/button';
import { injectDialogData, ZardDialogImports, ZardDialogRef } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardTextareaComponent } from '@/shared/components/textarea';

export interface DecisionDialogData {
  approved: boolean;
  summary: string;
}

export interface DecisionDialogResult {
  comment: string | null;
}

/** Confirmation d'une décision admin, avec commentaire optionnel (transmis au demandeur). */
@Component({
  selector: 'app-decision-dialog',
  imports: [FormsModule, ZardButtonComponent, ZardDialogImports, ZardFieldImports, ZardTextareaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-dialog-header>
      <z-dialog-title>{{ data.approved ? 'Approuver' : 'Refuser' }} la demande</z-dialog-title>
      <z-dialog-description>{{ data.summary }}</z-dialog-description>
    </z-dialog-header>
    <z-field>
      <label z-field-label for="decision-comment">Commentaire (facultatif)</label>
      <textarea z-textarea id="decision-comment" rows="3" placeholder="Transmis au demandeur avec la décision" [(ngModel)]="comment"></textarea>
    </z-field>
    <z-dialog-footer>
      <button z-button zType="outline" type="button" z-dialog-close>Annuler</button>
      <button z-button type="button" [zType]="data.approved ? 'default' : 'destructive'" (click)="confirm()">
        {{ data.approved ? 'Approuver' : 'Refuser' }}
      </button>
    </z-dialog-footer>
  `,
})
export class DecisionDialog {
  protected readonly data = injectDialogData<DecisionDialogData>();
  private readonly ref = inject<ZardDialogRef<DecisionDialog, DecisionDialogResult>>(ZardDialogRef);
  protected comment = '';

  protected confirm(): void {
    this.ref.close({ comment: this.comment.trim() || null });
  }
}
