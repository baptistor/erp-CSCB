import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { dayMinutes, weekValidator } from './typical-week-form';

describe('weekValidator (contrat hebdomadaire)', () => {
  const week = (weekly: number, start: string, end: string) =>
    new FormGroup({
      weeklyHours: new FormControl(weekly),
      days: new FormArray(
        [1, 2, 3, 4, 5, 6, 7].map(
          (d) =>
            new FormGroup({
              worked: new FormControl(d <= 5),
              startTime: new FormControl(start),
              endTime: new FormControl(end),
            }),
        ),
      ),
    });

  it('accepte la semaine par défaut : 5 × 9h–16h = 35 h pour 35 h', () => {
    expect(weekValidator(week(35, '09:00', '16:00'))).toBeNull();
  });

  it('refuse une semaine sous le contrat (rouge)', () => {
    expect(weekValidator(week(35, '09:00', '15:00'))).toEqual({ contract: 'under' });
  });

  it('refuse une semaine au-dessus du contrat (orange)', () => {
    expect(weekValidator(week(35, '09:00', '17:00'))).toEqual({ contract: 'over' });
  });

  it('signale une journée dont la fin est avant le début', () => {
    expect(weekValidator(week(35, '16:00', '09:00'))?.['days']).toBeTruthy();
  });

  it('refuse un contrat hors pas de 0,25', () => {
    expect(weekValidator(week(35.1, '09:00', '16:00'))).toEqual({ weekly: expect.any(String) });
  });

  it('durée d’un jour (0 si non travaillé)', () => {
    expect(dayMinutes({ worked: true, startTime: '09:00', endTime: '16:00' })).toBe(420);
    expect(dayMinutes({ worked: false, startTime: '09:00', endTime: '16:00' })).toBe(0);
  });
});
