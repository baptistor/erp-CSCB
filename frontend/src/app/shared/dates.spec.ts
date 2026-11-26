import { formatRelativeDay, formatShortDate } from './dates';

describe('dates', () => {
  const today = new Date(2026, 10, 26);

  it('date courte, année seulement si différente', () => {
    expect(formatShortDate('2026-11-27', today)).toBe('ven. 27 nov.');
    expect(formatShortDate('2027-01-04', today)).toBe('lun. 4 janv. 2027');
  });

  it('jour relatif, avec ou sans heure', () => {
    expect(formatRelativeDay('2026-11-26T15:11:00', today)).toBe('aujourd’hui');
    expect(formatRelativeDay('2026-11-25', today)).toBe('hier');
    expect(formatRelativeDay('2026-11-23T08:00:00', today)).toBe('il y a 3 jours');
  });
});
