import { draftAt, draftError, draftFromSelection, draftHours, kindAt, moveDraft, MyDay, resizeDraft } from './draft';

const h = (hours: number) => Math.round(hours * 60);
/** Journée 9h–12h30 / 13h30–17h, heures sup déjà demandées 18h–19h. */
const day: MyDay = {
  typical: [
    { start: h(9), end: h(12.5) },
    { start: h(13.5), end: h(17) },
  ],
  overtimes: [{ start: h(18), end: h(19) }],
};
const today = '2026-11-27';
const bounds = { start: h(7), end: h(21) };

describe('plage à placer', () => {
  it('clic sur mes horaires = absence, en dehors = heures sup, dans la pause = rien', () => {
    expect(kindAt(h(10), day)).toBe('absence');
    expect(kindAt(h(17.5), day)).toBe('overtime');
    expect(kindAt(h(7), day)).toBe('overtime');
    expect(kindAt(h(13), day)).toBeNull();
  });

  it('fait apparaître 1 h au quart d’heure cliqué, dans le créneau', () => {
    expect(draftAt(today, h(10) + 7, day)).toEqual({ kind: 'absence', date: today, start: h(10), end: h(11) });
    // près de la fin de la matinée : recalée pour tenir avant 12h30
    expect(draftAt(today, h(12.25), day)).toEqual({ kind: 'absence', date: today, start: h(11.5), end: h(12.5) });
    // entre 17h et 18h (heures sup déjà posées à 18h) : 17h–18h
    expect(draftAt(today, h(17.5), day)).toEqual({ kind: 'overtime', date: today, start: h(17), end: h(18) });
    expect(draftAt(today, h(13), day)).toBeNull();
  });

  it('une sélection glissée est rognée à mes horaires (absence) ou à la partie libre (heures sup)', () => {
    expect(draftFromSelection(today, { start: h(8), end: h(10) }, day)).toMatchObject({ kind: 'overtime', start: h(8), end: h(9) });
    expect(draftFromSelection(today, { start: h(11), end: h(15) }, day)).toMatchObject({ kind: 'absence', start: h(11), end: h(15) });
    expect(draftFromSelection(today, { start: h(16.5), end: h(20) }, day)).toMatchObject({ kind: 'absence', start: h(16.5), end: h(17) });
    expect(draftFromSelection(today, { start: h(17), end: h(21) }, day)).toMatchObject({ kind: 'overtime', start: h(19), end: h(21) });
  });

  it('dit pourquoi une plage n’est pas valable', () => {
    const absence = { kind: 'absence' as const, date: today, start: h(11), end: h(15) };
    expect(draftError(absence, day, today)).toBeNull();
    expect(draftError({ ...absence, end: h(18) }, day, today)).toContain('pendant vos horaires');
    expect(draftError({ ...absence, date: '2026-11-26' }, day, today)).toContain("à partir d'aujourd'hui");
    const overtime = { kind: 'overtime' as const, date: today, start: h(17), end: h(18) };
    expect(draftError(overtime, day, today)).toBeNull();
    expect(draftError({ ...overtime, start: h(16) }, day, today)).toContain('journée type');
    expect(draftError({ ...overtime, end: h(18.5) }, day, today)).toContain('Chevauche');
    expect(draftError({ ...overtime, start: h(12), end: h(13) }, { typical: [], overtimes: [] }, today)).toContain('pause');
    // heures sup : déclaration après coup possible jusqu'à J−31
    expect(draftError({ ...overtime, date: '2026-10-27' }, day, today)).toBeNull();
    expect(draftError({ ...overtime, date: '2026-10-26' }, day, today)).toContain('31 jours');
  });

  it('compte les heures : absence hors pause, heures sup = durée', () => {
    expect(draftHours({ kind: 'absence', date: today, start: h(11), end: h(15) }, day)).toBe(3);
    expect(draftHours({ kind: 'overtime', date: today, start: h(17), end: h(18.25) }, day)).toBe(1.25);
  });

  it('se déplace et s’étire au quart d’heure, sans sortir de la grille', () => {
    const d = { kind: 'overtime' as const, date: today, start: h(17), end: h(18) };
    expect(moveDraft(d, 37, bounds)).toMatchObject({ start: h(17.5), end: h(18.5) });
    expect(moveDraft(d, 600, bounds)).toMatchObject({ start: h(20), end: h(21) });
    expect(resizeDraft(d, 'end', h(19.4), bounds)).toMatchObject({ start: h(17), end: h(19.5) });
    expect(resizeDraft(d, 'start', h(18.5), bounds)).toMatchObject({ start: h(17.75), end: h(18) });
  });

  it('semaine de vacances : pas de pause, les heures sup peuvent passer midi', () => {
    const holiday: MyDay = { typical: [{ start: h(9), end: h(12) }], overtimes: [], noBreak: true };
    expect(kindAt(h(13), holiday)).toBe('overtime');
    expect(draftAt(today, h(13), holiday)).toEqual({ kind: 'overtime', date: today, start: h(13), end: h(14) });
    expect(draftError({ kind: 'overtime', date: today, start: h(12), end: h(14) }, holiday, today)).toBeNull();
  });
});
