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
      'Ajoutez les heures en plus sur le planning (jour concerné), puis faites une déclaration ' +
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

const overlap = (a: WorkedRange, b: WorkedRange) => a.start < b.end && b.start < a.end;

/** Pause de midi obligatoire, jamais travaillée (spec §1). */
export const BREAK: WorkedRange = { start: '12:30', end: '13:30' };

const length = (r: WorkedRange) => toMinutes(r.end) - toMinutes(r.start);

/** Heures ajoutées (spec §1) : fin > début, sans empiéter sur la pause, la journée type ni d'autres heures ajoutées. */
export function extraError(range: WorkedRange, typical: WorkedRange[], others: WorkedRange[]): string | null {
  const error = rangeError(range.start, range.end);
  if (error) return error;
  if (overlap(range, BREAK)) return `Ces heures empiètent sur la pause de midi (${BREAK.start}–${BREAK.end})`;
  const day = typical.find((t) => overlap(range, t));
  if (day) return `Ces heures empiètent sur la journée type (${day.start}–${day.end})`;
  const other = others.find((o) => overlap(range, o));
  return other ? `Ces heures chevauchent des heures déjà ajoutées (${other.start}–${other.end})` : null;
}

/** Partie (la plus longue) d'une sélection en dehors de la journée type et de la pause ; null si rien ne dépasse. */
export function outsideTypical(range: WorkedRange, typical: WorkedRange[]): WorkedRange | null {
  let parts = [range];
  for (const busy of [BREAK, ...typical]) {
    parts = parts.flatMap((p) =>
      overlap(p, busy)
        ? [{ start: p.start, end: busy.start }, { start: busy.end, end: p.end }].filter((x) => x.start < x.end)
        : [p],
    );
  }
  return parts.sort((a, b) => length(b) - length(a))[0] ?? null;
}

/** Plage proposée par défaut : une heure après la journée type (9h un jour non travaillé), hors pause. */
export function defaultExtra(typical: WorkedRange[]): WorkedRange {
  let start = typical.map((t) => t.end).sort().at(-1) ?? '09:00';
  if (start >= BREAK.start && start < BREAK.end) start = BREAK.end;
  const end = Math.min(toMinutes(start) + 60, 24 * 60 - 1);
  return { start, end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` };
}

/** Minutes travaillées entre deux heures (pause et coupures non comptées). */
export function workedMinutes(worked: WorkedRange[], start: string, end: string): number {
  return worked
    .filter((w) => overlap(w, { start, end }))
    .reduce((sum, w) => sum + length({ start: w.start > start ? w.start : start, end: w.end < end ? w.end : end }), 0);
}

/** Plages triées, celles qui se touchent étant fusionnées (une absence peut être à cheval sur deux plages collées). */
export function mergeRanges(ranges: WorkedRange[]): WorkedRange[] {
  const merged: WorkedRange[] = [];
  for (const r of [...ranges].sort((a, b) => a.start.localeCompare(b.start))) {
    const last = merged.at(-1);
    if (last && r.start <= last.end) last.end = r.end > last.end ? r.end : last.end;
    else merged.push({ ...r });
  }
  return merged;
}

/** Créneaux 'HH:mm' au quart d'heure de `from` à `to` inclus ; `current` est ajouté s'il en sort (donnée ancienne). */
export function quarterSlots(from: string, to: string, current?: string): string[] {
  const slots: string[] = [];
  for (let m = toMinutes(from); m <= toMinutes(to); m += 15) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  if (current && !slots.includes(current)) {
    slots.push(current);
    slots.sort();
  }
  return slots;
}
