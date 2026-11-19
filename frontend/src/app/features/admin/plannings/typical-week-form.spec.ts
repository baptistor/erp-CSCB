import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { weekValidator } from './typical-week-form';

describe('weekValidator', () => {
  const week = (min: number, start: string, end: string) =>
    new FormGroup({
      minDailyHours: new FormControl(min),
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

  it('accepte la semaine par défaut (9h–17h, minimum 8 h)', () => {
    expect(weekValidator(week(8, '09:00', '17:00'))).toBeNull();
  });

  it('signale chaque jour travaillé sous le minimum (pas le week-end)', () => {
    const errors = weekValidator(week(8, '09:00', '16:00'))?.['days'] as Record<number, string>;
    expect(Object.keys(errors)).toEqual(['0', '1', '2', '3', '4']);
    expect(errors[0]).toBe('7 h < minimum de 8 h');
  });

  it('refuse un minimum hors pas de 0,25', () => {
    expect(weekValidator(week(7.1, '08:00', '17:00'))).toEqual({ min: expect.any(String) });
  });
});
