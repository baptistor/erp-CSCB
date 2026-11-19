import { FormControl, FormGroup } from '@angular/forms';
import { workedDayValidator } from './day-dialog';

describe('workedDayValidator', () => {
  const group = (worked: boolean, startTime: string, endTime: string) =>
    new FormGroup({
      worked: new FormControl(worked),
      startTime: new FormControl(startTime),
      endTime: new FormControl(endTime),
    });

  it('accepte une journée de n’importe quelle durée', () => {
    expect(workedDayValidator(group(true, '09:00', '16:00'))).toBeNull();
    expect(workedDayValidator(group(true, '10:00', '11:00'))).toBeNull();
  });

  it('refuse une fin avant le début', () => {
    expect(workedDayValidator(group(true, '16:00', '09:00'))).toEqual({
      range: "L'heure de fin doit être après l'heure de début",
    });
  });

  it("ne contrôle pas un jour non travaillé", () => {
    expect(workedDayValidator(group(false, '16:00', '09:00'))).toBeNull();
  });
});
