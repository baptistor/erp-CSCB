/** Règles d'horaires de la spec §1, côté formulaire (le serveur revalide toujours). */

export const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;

/** 'HH:mm' -> minutes depuis minuit. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/**
 * Erreur d'une journée travaillée, ou null si valide.
 * Fin > début (donc pas à cheval sur minuit) et durée ≥ minimum (si connu).
 */
export function rangeError(start: string, end: string, minHours: number | null): string | null {
  if (!start || !end) return 'Renseignez le début et la fin';
  const duration = toMinutes(end) - toMinutes(start);
  if (duration <= 0) return "L'heure de fin doit être après l'heure de début";
  if (minHours != null && duration < minHours * 60) {
    return `${formatMinutes(duration)} < minimum de ${formatMinutes(minHours * 60)}`;
  }
  return null;
}

/** Minimum d'heures : entre 0,25 et 24, par pas de 0,25. */
export function isValidMinHours(value: number | null): boolean {
  return value != null && value > 0 && value <= 24 && Number.isInteger(value * 4);
}

/**
 * Droit de modifier la journée `date` ('YYYY-MM-DD') de l'employé `ownerId` (spec §1) :
 * l'admin tout ; l'employé ses propres journées à partir d'aujourd'hui (le serveur revérifie).
 */
export function canEditDay(
  me: { id: number; role: string } | null,
  ownerId: number,
  date: string,
  today: string,
): boolean {
  if (!me) return false;
  if (me.role === 'ADMIN') return true;
  return me.id === ownerId && date >= today;
}
