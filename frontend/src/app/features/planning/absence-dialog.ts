import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AbsenceType } from '../../api/models';
import { ABSENCE_TYPE_LABELS, formatHours } from '../../shared/requests';

export interface AbsenceDialogData {
  /** Récapitulatif lisible, ex. « vendredi 27/11/2026 de 14:00 à 16:00 ». */
  summary: string;
  /** Heures calculées (estimation identique au calcul serveur). */
  hours: number;
  /** Heures disponibles pour une récupération (solde − récup en attente). */
  available: number | null;
}

export interface AbsenceDialogResult {
  type: AbsenceType;
  comment: string | null;
}

/** Une récupération ne peut pas dépasser le disponible (le serveur revérifie). */
export function recupExceedsAvailable(type: AbsenceType, hours: number, available: number | null): boolean {
  return type === 'RECUP_HEURES_SUP' && available != null && hours > available;
}

/** Fenêtre ouverte au relâchement de la souris (spec §3) : récap, type, motif facultatif. */
@Component({
  selector: 'app-absence-dialog',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Demander une absence</h2>
    <mat-dialog-content class="fields">
      <p class="summary">{{ data.summary }} — <strong>{{ hoursText(data.hours) }}</strong></p>
      <mat-button-toggle-group [value]="type()" (change)="type.set($event.value)" aria-label="Type d'absence">
        @for (t of types; track t) {
          <mat-button-toggle [value]="t">{{ labels[t] }}</mat-button-toggle>
        }
      </mat-button-toggle-group>
      @if (type() === 'RECUP_HEURES_SUP' && data.available != null) {
        <p class="info">Disponible pour une récupération : <strong>{{ hoursText(data.available) }}</strong></p>
      }
      @if (exceeds()) {
        <p class="error">Solde insuffisant : choisissez « Sans solde » ou une plage plus courte.</p>
      }
      <mat-form-field appearance="outline" class="comment">
        <mat-label>Motif (facultatif)</mat-label>
        <textarea matInput rows="3" [(ngModel)]="comment" cdkFocusInitial></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Annuler</button>
      <button mat-flat-button type="button" [disabled]="exceeds()" (click)="send()">Envoyer la demande</button>
    </mat-dialog-actions>
  `,
  styles: `
    .fields { display: flex; flex-direction: column; gap: 12px; min-width: min(420px, 80vw); }
    .summary { margin: 0; }
    .info { margin: 0; color: var(--mat-sys-on-surface-variant); }
    .error { margin: 0; color: var(--mat-sys-error); }
    .comment { width: 100%; }
  `,
})
export class AbsenceDialog {
  protected readonly data = inject<AbsenceDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AbsenceDialog, AbsenceDialogResult>>(MatDialogRef);

  protected readonly types: AbsenceType[] = ['RECUP_HEURES_SUP', 'SANS_SOLDE'];
  protected readonly labels = ABSENCE_TYPE_LABELS;
  protected readonly type = signal<AbsenceType>(
    recupExceedsAvailable('RECUP_HEURES_SUP', this.data.hours, this.data.available) ? 'SANS_SOLDE' : 'RECUP_HEURES_SUP',
  );
  protected comment = '';
  protected readonly exceeds = computed(() => recupExceedsAvailable(this.type(), this.data.hours, this.data.available));
  protected readonly hoursText = (h: number) => formatHours(h);

  protected send(): void {
    if (this.exceeds()) return;
    this.ref.close({ type: this.type(), comment: this.comment.trim() || null });
  }
}
