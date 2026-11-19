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
      'Déclarez les heures en plus sur le planning (journée concernée), puis faites une déclaration ' +
      "d'heures supplémentaires dans « Mes demandes ».",
  };
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

/** Journée prévue (travaillée) d'un employé : 'HH:mm' → 'HH:mm'. */
export interface WorkedRange {
  start: string;
  end: string;
}

/**
 * Une sélection d'absence est-elle autorisée (spec §3) ? À partir d'aujourd'hui et sur ses propres horaires :
 * - plage horaire : un seul jour travaillé, comprise dans la journée prévue ;
 * - journées entières (dates de fin exclusive) : au moins un jour travaillé.
 * `myDays` : journées travaillées de l'utilisateur, indexées par date 'YYYY-MM-DD'.
 */
export function absenceSelectionAllowed(
  myDays: Map<string, WorkedRange>,
  selection:
    | { allDay: true; startDate: string; endDateExclusive: string }
    | { allDay: false; date: string; start: string; end: string },
  today: string,
): boolean {
  if (selection.allDay) {
    if (selection.startDate < today) return false;
    for (const [date] of myDays) {
      if (date >= selection.startDate && date < selection.endDateExclusive) return true;
    }
    return false;
  }
  if (selection.date < today) return false;
  const day = myDays.get(selection.date);
  return !!day && selection.start >= day.start && selection.end <= day.end && selection.end > selection.start;
}
