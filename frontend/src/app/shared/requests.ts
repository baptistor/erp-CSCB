import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { AbsenceType, RequestStatus } from '../api/models';

export const STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
};

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  RECUP_HEURES_SUP: 'Récupération d’heures sup',
  SANS_SOLDE: 'Sans solde',
};

/** 3.5 → « 3,5 h » ; avec signe si demandé (+4 h / −3 h). */
export function formatHours(hours: number, signed = false): string {
  const text = `${Math.abs(hours).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
  if (!signed || hours === 0) return hours < 0 ? `−${text}` : text;
  return hours > 0 ? `+${text}` : `−${text}`;
}

/** Heures au pas de 0,25 ; strictement positives sauf `allowNegative` (ajustements : non nulles). */
export function quarterHoursValidator(max: number, allowNegative = false): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as number | null;
    if (value == null || (control.value as unknown) === '') return null; // géré par required
    const positive = allowNegative ? value !== 0 : value > 0;
    if (!positive || Math.abs(value) > max || !Number.isInteger(value * 4)) {
      return { quarterHours: true };
    }
    return null;
  };
}
