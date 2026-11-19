import { FormControl } from '@angular/forms';
import { formatHours, quarterHoursValidator } from './requests';

describe('requests helpers', () => {
  it('formate les heures en français', () => {
    expect(formatHours(3.5)).toBe('3,5 h');
    expect(formatHours(4, true)).toBe('+4 h');
    expect(formatHours(-3, true)).toBe('−3 h');
    expect(formatHours(-2)).toBe('−2 h');
  });

  it('accepte les heures au pas de 0,25', () => {
    const v = quarterHoursValidator(24);
    expect(v(new FormControl(2.25))).toBeNull();
    expect(v(new FormControl(0.25))).toBeNull();
  });

  it('refuse 0, les négatifs, le dépassement et les pas incorrects', () => {
    const v = quarterHoursValidator(24);
    for (const bad of [0, -1, 25, 1.1, 2.3]) {
      expect(v(new FormControl(bad))).toEqual({ quarterHours: true });
    }
  });

  it('ajustements : négatifs acceptés mais pas 0', () => {
    const v = quarterHoursValidator(999, true);
    expect(v(new FormControl(-12.5))).toBeNull();
    expect(v(new FormControl(0))).toEqual({ quarterHours: true });
  });
});
