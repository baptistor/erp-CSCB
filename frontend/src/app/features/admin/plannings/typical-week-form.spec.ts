import { dayError, dayMinutes, DayValue, weekOk } from './typical-week-form';

describe('semaine type (matin + après-midi)', () => {
  const day = (start: string, end: string, worked = true): DayValue => ({
    morning: worked,
    morningStart: start,
    morningEnd: '12:30',
    afternoon: worked,
    afternoonStart: '13:30',
    afternoonEnd: end,
  });
  const week = (start: string, end: string) => [1, 2, 3, 4, 5, 6, 7].map((d) => day(start, end, d <= 5));

  it('accepte la semaine par défaut : 5 × 7 h = 35 h', () => {
    expect(weekOk(week('09:00', '17:00'), 35)).toBe(true);
  });

  it('refuse sous ou au-dessus du contrat, ou un contrat hors pas', () => {
    expect(weekOk(week('09:00', '16:00'), 35)).toBe(false);
    expect(weekOk(week('09:00', '18:00'), 35)).toBe(false);
    expect(weekOk(week('09:00', '17:00'), 35.1)).toBe(false);
  });

  it('refuse un matin après 12:30, un après-midi avant 13:30, une fin avant le début', () => {
    expect(dayError({ ...day('09:00', '17:00'), morningEnd: '12:45' })).toContain('pause de midi');
    expect(dayError({ ...day('09:00', '17:00'), afternoonStart: '13:15' })).toContain('pause de midi');
    expect(dayError(day('09:00', '13:00'))).toContain('Après-midi');
    expect(dayError(day('09:00', '17:00'))).toBeNull();
  });

  it('durée hors pause ; matin seul ; non travaillé', () => {
    expect(dayMinutes(day('09:00', '17:00'))).toBe(420);
    expect(dayMinutes({ ...day('09:00', '17:00'), afternoon: false })).toBe(210);
    expect(dayMinutes(day('09:00', '17:00', false))).toBe(0);
  });

  it('semaine de vacances : une seule plage, sans pause (9h–16h = 7 h)', () => {
    const holiday = (worked: boolean): DayValue => ({ ...day('09:00', '17:00', worked), morningEnd: '16:00' });
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => holiday(d <= 5));
    expect(dayError(holiday(true), true)).toBeNull();
    expect(dayMinutes(holiday(true), true)).toBe(420);
    expect(weekOk(days, 35, true)).toBe(true);
    expect(dayError({ ...holiday(true), morningEnd: '08:00' }, true)).not.toBeNull();
  });
});
