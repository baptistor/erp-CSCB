import { FormControl, FormGroup } from '@angular/forms';
import { workedDayValidator } from './day-dialog';

describe('workedDayValidator', () => {
  const group = (worked: boolean, startTime: string, endTime: string) =>
    new FormGroup({
      worked: new FormControl(worked),
      startTime: new FormControl(startTime),
      endTime: new FormControl(endTime),
    });

  it('accepte une journée ≥ minimum', () => {
    expect(workedDayValidator(() => 8)(group(true, '09:00', '17:00'))).toBeNull();
  });

  it('refuse une journée < minimum avec le message', () => {
    expect(workedDayValidator(() => 8)(group(true, '09:00', '16:00'))).toEqual({ range: '7 h < minimum de 8 h' });
  });

  it("n'applique pas le minimum à un jour non travaillé", () => {
    expect(workedDayValidator(() => 8)(group(false, '09:00', '10:00'))).toBeNull();
  });
});
