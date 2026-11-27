import { holidayMonths } from './school-holidays-admin';

describe('calendrier des vacances scolaires', () => {
  // vendredi 27 novembre 2026 : première semaine modifiable = lundi 30 novembre
  const cal = holidayMonths('2026-11-27', 52);

  it('commence à la semaine suivante et couvre 52 semaines', () => {
    expect(cal.firstMonday).toBe('2026-11-30');
    expect(cal.lastMonday).toBe('2027-11-22');
    expect(cal.months[0].label).toBe('novembre 2026');
    expect(cal.months.at(-1)!.label).toBe('novembre 2027');
  });

  it('range les semaines du lundi au dimanche, à cheval sur deux mois si besoin', () => {
    const dec = cal.months[1];
    expect(dec.label).toBe('décembre 2026');
    expect(dec.weeks[0].monday).toBe('2026-11-30');
    expect(dec.weeks[0].days.map((d) => d.day)).toEqual([30, 1, 2, 3, 4, 5, 6]);
    expect(dec.weeks[0].days[0].inMonth).toBe(false);
    expect(dec.weeks.at(-1)!.monday).toBe('2026-12-28');
    // la semaine du 30 novembre apparaît aussi en novembre
    expect(cal.months[0].weeks.at(-1)!.monday).toBe('2026-11-30');
  });
});
