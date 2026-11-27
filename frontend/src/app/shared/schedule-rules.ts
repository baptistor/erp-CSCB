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

/** Erreur d'une journée travaillée, ou null si valide : fin > début (donc pas à cheval sur minuit). */
export function rangeError(start: string, end: string): string | null {
  if (!start || !end) return 'Renseignez le début et la fin';
  return toMinutes(end) - toMinutes(start) <= 0 ? "L'heure de fin doit être après l'heure de début" : null;
}

/** Contrat hebdomadaire : entre 0,25 et 168 h, par pas de 0,25. */
export function isValidWeeklyHours(value: number | null): boolean {
  return value != null && value > 0 && value <= 168 && Number.isInteger(value * 4);
}

/** État de la semaine type par rapport au contrat (spec §1) : vert / rouge / orange. */
export interface ContractStatus {
  kind: 'ok' | 'under' | 'over';
  message: string;
}

export function contractStatus(totalMinutes: number, weeklyHours: number): ContractStatus {
  const contract = Math.round(weeklyHours * 60);
  const summary = `${formatMinutes(totalMinutes)} / ${formatMinutes(contract)}`;
  if (totalMinutes === contract) return { kind: 'ok', message: `${summary} — contrat respecté` };
  if (totalMinutes < contract) {
    return { kind: 'under', message: `${summary} — il manque ${formatMinutes(contract - totalMinutes)}` };
  }
  return {
    kind: 'over',
    message:
      `${summary} — ${formatMinutes(totalMinutes - contract)} de trop : la semaine type doit rester au contrat. ` +
      'Posez les heures en plus sur le planning, au jour concerné : elles deviennent une demande ' +
      "d'heures supplémentaires.",
  };
}

/** Journée prévue (travaillée) d'un employé : 'HH:mm' → 'HH:mm'. */
export interface WorkedRange {
  start: string;
  end: string;
}

/** Pause de midi obligatoire, jamais travaillée (spec §1). */
export const BREAK: WorkedRange = { start: '12:30', end: '13:30' };
