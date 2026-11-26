import { Type } from '@angular/core';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService } from '@/shared/components/dialog';

/**
 * Ouvre un composant dans une modale Zard et attend sa fermeture.
 * Le composant affiche lui-même titre et boutons, et se ferme avec `inject(ZardDialogRef).close(résultat)`.
 * Résout `undefined` si la modale est fermée sans résultat (Annuler, Échap, clic à l'extérieur).
 */
export function openDialog<C, D, R>(
  dialogs: ZardDialogService,
  component: Type<C>,
  data?: D,
  width = '480px',
): Promise<R | undefined> {
  const ref = dialogs.create<C, D>({ zContent: component, zData: data, zHideFooter: true, zWidth: width });
  return ref.closed as Promise<R | undefined>;
}

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

/** Confirmation d'une action destructive : résout true si confirmée. */
export async function confirmDialog(dialogs: ZardAlertDialogService, data: ConfirmDialogData): Promise<boolean> {
  let confirmed = false;
  const ref = dialogs.confirm({
    zTitle: data.title,
    zDescription: data.message,
    zOkText: data.confirmLabel,
    zCancelText: 'Annuler',
    zOkDestructive: true,
    zOnOk: () => {
      confirmed = true;
    },
  });
  await ref.closed;
  return confirmed;
}
