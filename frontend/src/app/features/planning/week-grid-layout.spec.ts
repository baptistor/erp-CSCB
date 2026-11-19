import {
  blockPosition,
  clipToDay,
  gridBounds,
  initials,
  selectionRange,
  toTime,
  weekDays,
  yToMinutes,
} from './week-grid-layout';

describe('week-grid-layout', () => {
  const bounds = { start: 7 * 60, end: 21 * 60 }; // 14 h → 560 px à 40 px/h

  it('bornes par défaut 07:00–21:00, élargies à l’heure pleine', () => {
    expect(gridBounds([{ start: '09:00', end: '17:00' }])).toEqual(bounds);
    expect(gridBounds([{ start: '06:30', end: '21:15' }])).toEqual({ start: 6 * 60, end: 22 * 60 });
  });

  it('positionne un bloc en % de la grille', () => {
    expect(blockPosition('07:00', '21:00', bounds)).toEqual({ top: 0, height: 100 });
    const p = blockPosition('14:00', '16:00', bounds);
    expect(p.top).toBeCloseTo(50);
    expect(p.height).toBeCloseTo((120 / 840) * 100);
  });

  it('convertit une position en heure au quart d’heure', () => {
    expect(toTime(yToMinutes(280, 560, bounds, 'floor'))).toBe('14:00');
    expect(toTime(yToMinutes(285, 560, bounds, 'floor'))).toBe('14:00');
    expect(toTime(yToMinutes(285, 560, bounds, 'ceil'))).toBe('14:15');
    expect(toTime(yToMinutes(-50, 560, bounds, 'floor'))).toBe('07:00');
  });

  it('sélection dans les deux sens ; un clic = 1 h', () => {
    expect(selectionRange(360, 280, 560, bounds)).toEqual({ start: 14 * 60, end: 16 * 60 });
    expect(selectionRange(280, 281, 560, bounds)).toEqual({ start: 14 * 60, end: 15 * 60 });
  });

  it('rogne la sélection aux horaires du jour', () => {
    const day = { start: '09:00', end: '17:00' };
    expect(clipToDay({ start: 8 * 60, end: 10 * 60 }, day)).toEqual({ start: 9 * 60, end: 10 * 60 });
    expect(clipToDay({ start: 18 * 60, end: 19 * 60 }, day)).toBeNull();
    expect(clipToDay({ start: 10 * 60, end: 11 * 60 }, undefined)).toBeNull();
  });

  it('rogne au quart d’heure à l’intérieur d’horaires non alignés', () => {
    const day = { start: '09:10', end: '17:10' };
    expect(clipToDay({ start: 8 * 60, end: 18 * 60 }, day)).toEqual({ start: 9 * 60 + 15, end: 17 * 60 });
    expect(clipToDay({ start: 17 * 60, end: 18 * 60 }, day)).toBeNull();
  });

  it('jours de la semaine du lundi au dimanche', () => {
    expect(weekDays(new Date(2026, 10, 19))).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
    ]);
    expect(weekDays(new Date(2026, 10, 22))[0]).toBe('2026-11-16'); // dimanche
  });

  it('initiales', () => {
    expect(initials({ firstName: 'Alice', lastName: 'Martin', email: 'a@x.fr' })).toBe('AM');
    expect(initials({ firstName: null, lastName: null, email: 'bob@x.fr' })).toBe('B');
  });
});
