import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ZardButtonComponent } from '@/shared/components/button';
import { injectDialogData, ZardDialogImports, ZardDialogRef } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardTextareaComponent } from '@/shared/components/textarea';
import { ZardToggleGroupComponent, ZardToggleGroupItem } from '@/shared/components/toggle-group';
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
  imports: [FormsModule, ZardButtonComponent, ZardDialogImports, ZardFieldImports, ZardTextareaComponent, ZardToggleGroupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-dialog-header>
      <z-dialog-title>Demander une absence</z-dialog-title>
      <z-dialog-description>
        {{ data.summary }} — <strong class="text-foreground">{{ hoursText(data.hours) }}</strong>
      </z-dialog-description>
    </z-dialog-header>
    <div class="flex flex-col gap-4">
      <z-toggle-group zMode="single" zType="outline" [zDeselectable]="false" [zItems]="typeItems"
                      [zValue]="type()" (valueChange)="type.set($any($event))" aria-label="Type d'absence" />
      @if (type() === 'RECUP_HEURES_SUP' && data.available != null) {
        <p class="text-sm text-muted-foreground">
          Disponible pour une récupération : <strong>{{ hoursText(data.available) }}</strong>
        </p>
      }
      @if (exceeds()) {
        <p class="text-sm text-destructive">Solde insuffisant : choisissez « Sans solde » ou une plage plus courte.</p>
      }
      <z-field>
        <label z-field-label for="absence-comment">Motif (facultatif)</label>
        <textarea z-textarea id="absence-comment" rows="3" placeholder="ex. rendez-vous médical" [(ngModel)]="comment"></textarea>
      </z-field>
    </div>
    <z-dialog-footer>
      <button z-button zType="outline" type="button" z-dialog-close>Annuler</button>
      <button z-button type="button" [disabled]="exceeds()" (click)="send()">Envoyer la demande</button>
    </z-dialog-footer>
  `,
})
export class AbsenceDialog {
  protected readonly data = injectDialogData<AbsenceDialogData>();
  private readonly ref = inject<ZardDialogRef<AbsenceDialog, AbsenceDialogResult>>(ZardDialogRef);

  private readonly types: AbsenceType[] = ['RECUP_HEURES_SUP', 'SANS_SOLDE'];
  protected readonly typeItems: ZardToggleGroupItem[] = this.types.map((t) => ({
    value: t,
    label: ABSENCE_TYPE_LABELS[t],
  }));
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
