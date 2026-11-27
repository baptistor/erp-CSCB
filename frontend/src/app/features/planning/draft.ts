/**
 * Plage « à placer » sur le planning (spec §1) : un clic sur ses horaires fait apparaître une absence, un clic en
 * dehors une demande d'heures sup. Fonctions pures, en minutes depuis minuit ; le serveur revalide toujours.
 */
import { addDays } from '../../shared/dates';
import { MinuteRange, SNAP_MINUTES, toTime } from './week-grid-layout';

export type DraftKind = 'absence' | 'overtime';

export interface Draft extends MinuteRange {
  kind: DraftKind;
  date: string;
}

/** Mon emploi du temps du jour : journée type et heures sup déjà demandées (en attente / acceptées). */
export interface MyDay {
  typical: MinuteRange[];
  overtimes: MinuteRange[];
  /** Semaine de vacances scolaires : pas de pause de midi. */
  noBreak?: boolean;
}

/** Pause de midi 12:30–13:30, jamais travaillée. */
export const BREAK_MINUTES: MinuteRange = { start: 12 * 60 + 30, end: 13 * 60 + 30 };
const DAY_END = 24 * 60;
const DEFAULT_LENGTH = 60;
/** Heures sup : de J−31 à J+62 (spec §2). */
export const OVERTIME_PAST_DAYS = 31;
export const OVERTIME_FUTURE_DAYS = 62;

const overlaps = (a: MinuteRange, b: MinuteRange) => a.start < b.end && b.start < a.end;
const inside = (minute: number, r: MinuteRange) => minute >= r.start && minute < r.end;
const floorQ = (m: number) => Math.floor(m / SNAP_MINUTES) * SNAP_MINUTES;
const ceilQ = (m: number) => Math.ceil(m / SNAP_MINUTES) * SNAP_MINUTES;
const label = (r: MinuteRange) => `${toTime(r.start)}–${toTime(r.end)}`;
/** La pause du jour (aucune en semaine de vacances). */
const breaks = (day: MyDay): MinuteRange[] => (day.noBreak ? [] : [BREAK_MINUTES]);

/** Ce que fait apparaître un clic à cette heure : absence sur ma journée type, heures sup ailleurs, rien dans la pause. */
export function kindAt(minute: number, day: MyDay): DraftKind | null {
  if (day.typical.some((r) => inside(minute, r))) return 'absence';
  return breaks(day).some((b) => inside(minute, b)) ? null : 'overtime';
}

/** Parties de `range` en dehors de toutes les plages `busy`. */
function subtract(range: MinuteRange, busy: MinuteRange[]): MinuteRange[] {
  let parts = [range];
  for (const b of busy) {
    parts = parts.flatMap((p) =>
      overlaps(p, b)
        ? [{ start: p.start, end: b.start }, { start: b.end, end: p.end }].filter((x) => x.end > x.start)
        : [p],
    );
  }
  return parts;
}

/** Plages libres pour des heures sup : hors journée type, pause et autres heures sup. */
function freeSlots(day: MyDay): MinuteRange[] {
  return subtract({ start: 0, end: DAY_END }, [...breaks(day), ...day.typical, ...day.overtimes]);
}

/** Plage au quart d'heure comprise dans `slot` (bornes arrondies vers l'intérieur), ou null si trop courte. */
function aligned(slot: MinuteRange): MinuteRange | null {
  const r = { start: ceilQ(slot.start), end: floorQ(slot.end) };
  return r.end > r.start ? r : null;
}

/** Plage d'1 h autour du clic, dans le créneau qui le contient (absence : ma journée ; heures sup : un créneau libre). */
export function draftAt(date: string, minute: number, day: MyDay): Draft | null {
  const kind = kindAt(minute, day);
  if (!kind) return null;
  const slots = kind === 'absence' ? day.typical : freeSlots(day);
  const containing = slots.find((s) => inside(minute, s));
  const slot = containing ? aligned(containing) : null;
  if (!slot) return null;
  let start = Math.max(floorQ(minute), slot.start);
  const end = Math.min(start + DEFAULT_LENGTH, slot.end);
  if (end - start < DEFAULT_LENGTH) start = Math.max(slot.start, end - DEFAULT_LENGTH);
  return end > start ? { kind, date, start, end } : null;
}

/**
 * Sélection glissée : son type suit l'heure de départ ; absence rognée à ma journée type (elle peut enjamber la
 * pause), heures sup réduites à la plus longue partie libre.
 */
export function draftFromSelection(date: string, selection: MinuteRange, day: MyDay): Draft | null {
  const kind = kindAt(selection.start, day) ?? kindAt(selection.end - 1, day);
  if (kind === 'absence') {
    const parts = day.typical
      .map((r) => aligned({ start: Math.max(r.start, selection.start), end: Math.min(r.end, selection.end) }))
      .filter((r): r is MinuteRange => r !== null);
    if (!parts.length) return null;
    return { kind, date, start: Math.min(...parts.map((p) => p.start)), end: Math.max(...parts.map((p) => p.end)) };
  }
  if (kind === 'overtime') {
    const best = subtract(selection, [...breaks(day), ...day.typical, ...day.overtimes])
      .map(aligned)
      .filter((r): r is MinuteRange => r !== null)
      .sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    return best ? { kind, date, ...best } : null;
  }
  return null;
}

/** Raison pour laquelle la plage ne peut pas être envoyée, ou null si elle est valable. */
export function draftError(draft: Draft, day: MyDay, today: string): string | null {
  if (draft.end <= draft.start) return 'La fin doit être après le début';
  if (draft.kind === 'absence') {
    if (draft.date < today) return "Une absence se pose à partir d'aujourd'hui";
    const startsIn = day.typical.some((r) => draft.start >= r.start && draft.start < r.end);
    const endsIn = day.typical.some((r) => draft.end > r.start && draft.end <= r.end);
    if (!startsIn || !endsIn) {
      return day.typical.length
        ? `Elle doit commencer et finir pendant vos horaires (${day.typical.map(label).join(', ')})`
        : "Ce jour n'est pas travaillé pour vous";
    }
    return null;
  }
  if (draft.date < addDays(today, -OVERTIME_PAST_DAYS) || draft.date > addDays(today, OVERTIME_FUTURE_DAYS)) {
    return `Les heures sup se posent de ${OVERTIME_PAST_DAYS} jours en arrière à ${OVERTIME_FUTURE_DAYS} jours à l'avance`;
  }
  if (breaks(day).some((b) => overlaps(draft, b))) return 'Pas sur la pause de midi (12:30–13:30)';
  const typical = day.typical.find((r) => overlaps(draft, r));
  if (typical) return `Pas sur la journée type (${label(typical)})`;
  const other = day.overtimes.find((r) => overlaps(draft, r));
  return other ? `Chevauche une autre demande d'heures sup (${label(other)})` : null;
}

/** Heures comptées, au quart d'heure : absence = heures de ma journée couvertes (pause exclue) ; heures sup = durée. */
export function draftHours(draft: Draft, day: MyDay): number {
  const minutes =
    draft.kind === 'overtime'
      ? draft.end - draft.start
      : day.typical.reduce((sum, r) => sum + Math.max(0, Math.min(r.end, draft.end) - Math.max(r.start, draft.start)), 0);
  return Math.round(minutes / SNAP_MINUTES) / 4;
}

/** Déplace la plage de `delta` minutes (au quart d'heure), sans sortir de [bounds]. */
export function moveDraft(draft: Draft, delta: number, bounds: MinuteRange): Draft {
  const length = draft.end - draft.start;
  const start = Math.min(Math.max(draft.start + Math.round(delta / SNAP_MINUTES) * SNAP_MINUTES, bounds.start), bounds.end - length);
  return { ...draft, start, end: start + length };
}

/** Étire le haut ou le bas de la plage jusqu'à `minute` (au quart d'heure), 15 min au minimum, dans [bounds]. */
export function resizeDraft(draft: Draft, edge: 'start' | 'end', minute: number, bounds: MinuteRange): Draft {
  const snapped = Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
  if (edge === 'start') {
    return { ...draft, start: Math.min(Math.max(snapped, bounds.start), draft.end - SNAP_MINUTES) };
  }
  return { ...draft, end: Math.max(Math.min(snapped, bounds.end), draft.start + SNAP_MINUTES) };
}
