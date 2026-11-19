/** Calculs purs de la grille horaire « Semaine » (spec §1) : bornes, positions, sélection au quart d'heure. */

export const SNAP_MINUTES = 15;
const DEFAULT_START = 7 * 60;
const DEFAULT_END = 21 * 60;

export interface MinuteRange {
  start: number;
  end: number;
}

/** 'HH:mm' → minutes depuis minuit. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** minutes depuis minuit → 'HH:mm'. */
export function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Bornes affichées : 07:00–21:00, élargies à l'heure pleine si un horaire en sort. */
export function gridBounds(ranges: { start: string; end: string }[]): MinuteRange {
  let start = DEFAULT_START;
  let end = DEFAULT_END;
  for (const range of ranges) {
    start = Math.min(start, Math.floor(toMinutes(range.start) / 60) * 60);
    end = Math.max(end, Math.ceil(toMinutes(range.end) / 60) * 60);
  }
  return { start, end };
}

/** Position verticale d'un bloc, en % de la hauteur de la grille. */
export function blockPosition(start: string, end: string, bounds: MinuteRange): { top: number; height: number } {
  const total = bounds.end - bounds.start;
  const from = Math.max(toMinutes(start), bounds.start);
  const to = Math.min(toMinutes(end), bounds.end);
  return { top: ((from - bounds.start) / total) * 100, height: (Math.max(to - from, 0) / total) * 100 };
}

/** Position verticale (px depuis le haut de la colonne) → minutes, au pas de 15 min, bornée à la grille. */
export function yToMinutes(y: number, columnHeight: number, bounds: MinuteRange, round: 'floor' | 'ceil'): number {
  const raw = bounds.start + (Math.min(Math.max(y, 0), columnHeight) / columnHeight) * (bounds.end - bounds.start);
  const snapped = (round === 'floor' ? Math.floor : Math.ceil)(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(Math.max(snapped, bounds.start), bounds.end);
}

/** Déplacement (px) en dessous duquel on considère un simple clic. */
export const CLICK_TOLERANCE_PX = 4;

/**
 * Plage sélectionnée entre deux positions (ordre quelconque), au quart d'heure.
 * Un simple clic (déplacement < 4 px) sélectionne une heure à partir du quart d'heure cliqué.
 */
export function selectionRange(y1: number, y2: number, columnHeight: number, bounds: MinuteRange): MinuteRange {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const start = yToMinutes(top, columnHeight, bounds, 'floor');
  if (bottom - top < CLICK_TOLERANCE_PX) return { start, end: Math.min(start + 60, bounds.end) };
  const end = Math.max(yToMinutes(bottom, columnHeight, bounds, 'ceil'), start + SNAP_MINUTES);
  return { start, end };
}

/**
 * Rogne une sélection aux horaires du jour, au quart d'heure **à l'intérieur** des horaires (une absence se pose au
 * quart d'heure) : avec une journée 09:10–17:10, 08:00–18:00 devient 09:15–17:00.
 * null si elle ne les touche pas (ou jour non travaillé).
 */
export function clipToDay(selection: MinuteRange, day: { start: string; end: string } | undefined): MinuteRange | null {
  if (!day) return null;
  const dayStart = Math.ceil(toMinutes(day.start) / SNAP_MINUTES) * SNAP_MINUTES;
  const dayEnd = Math.floor(toMinutes(day.end) / SNAP_MINUTES) * SNAP_MINUTES;
  const start = Math.max(selection.start, dayStart);
  const end = Math.min(selection.end, dayEnd);
  return end > start ? { start, end } : null;
}

/** Lundi → dimanche de la semaine contenant `date`, au format 'YYYY-MM-DD'. */
export function weekDays(date: Date): string[] {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/** Initiales pour l'en-tête de colonne : « Alice Martin » → « AM ». */
export function initials(user: { firstName?: string | null; lastName?: string | null; email: string }): string {
  const text = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((part) => part!.charAt(0).toUpperCase())
    .join('');
  return text || user.email.charAt(0).toUpperCase();
}
