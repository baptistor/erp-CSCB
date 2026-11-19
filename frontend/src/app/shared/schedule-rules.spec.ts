import { canEditDay, formatMinutes, isValidMinHours, rangeError } from './schedule-rules';

describe('schedule-rules', () => {
  it('accepte une journée au moins égale au minimum', () => {
    expect(rangeError('09:00', '17:00', 8)).toBeNull();
    expect(rangeError('08:00', '18:00', 8)).toBeNull();
  });

  it('refuse une journée plus courte que le minimum, avec un message clair', () => {
    expect(rangeError('09:00', '16:30', 8)).toBe('7 h 30 < minimum de 8 h');
  });

  it('refuse fin ≤ début (pas de plage à cheval sur minuit)', () => {
    expect(rangeError('22:00', '06:00', null)).toBe("L'heure de fin doit être après l'heure de début");
    expect(rangeError('09:00', '09:00', null)).not.toBeNull();
  });

  it('exige début et fin', () => {
    expect(rangeError('09:00', '', 8)).not.toBeNull();
  });

  it('valide le minimum au pas de 0,25', () => {
    expect(isValidMinHours(7.75)).toBe(true);
    expect(isValidMinHours(7.1)).toBe(false);
    expect(isValidMinHours(0)).toBe(false);
    expect(isValidMinHours(25)).toBe(false);
  });

  it('formate les durées', () => {
    expect(formatMinutes(480)).toBe('8 h');
    expect(formatMinutes(465)).toBe('7 h 45');
  });
});

describe('canEditDay', () => {
  const today = '2026-11-19';
  const alice = { id: 2, role: 'EMPLOYEE' };
  const admin = { id: 1, role: 'ADMIN' };

  it("l'employé modifie ses journées à partir d'aujourd'hui", () => {
    expect(canEditDay(alice, 2, '2026-11-19', today)).toBe(true);
    expect(canEditDay(alice, 2, '2026-12-01', today)).toBe(true);
  });

  it("l'employé ne modifie ni un jour passé ni la journée d'un autre", () => {
    expect(canEditDay(alice, 2, '2026-11-18', today)).toBe(false);
    expect(canEditDay(alice, 3, '2026-12-01', today)).toBe(false);
  });

  it("l'admin modifie tout", () => {
    expect(canEditDay(admin, 3, '2020-01-01', today)).toBe(true);
  });

  it('personne sans session ne modifie rien', () => {
    expect(canEditDay(null, 2, '2026-12-01', today)).toBe(false);
  });
});
