import { contractStatus, formatMinutes, isValidWeeklyHours, rangeError } from './schedule-rules';

describe('schedule-rules', () => {
  it('accepte une journée de n’importe quelle durée (plus de minimum par jour)', () => {
    expect(rangeError('09:00', '16:00')).toBeNull();
    expect(rangeError('10:00', '11:00')).toBeNull();
  });

  it('refuse fin ≤ début (pas de plage à cheval sur minuit)', () => {
    expect(rangeError('22:00', '06:00')).toBe("L'heure de fin doit être après l'heure de début");
    expect(rangeError('09:00', '09:00')).not.toBeNull();
  });

  it('exige début et fin', () => {
    expect(rangeError('09:00', '')).not.toBeNull();
  });

  it('valide le contrat au pas de 0,25 h (max 168 h)', () => {
    expect(isValidWeeklyHours(35)).toBe(true);
    expect(isValidWeeklyHours(37.5)).toBe(true);
    expect(isValidWeeklyHours(35.1)).toBe(false);
    expect(isValidWeeklyHours(0)).toBe(false);
    expect(isValidWeeklyHours(169)).toBe(false);
  });

  it('contrat : vert si exact, rouge s’il manque des heures, orange s’il y en a trop', () => {
    expect(contractStatus(35 * 60, 35)).toEqual({ kind: 'ok', message: '35 h / 35 h — contrat respecté' });
    expect(contractStatus(33 * 60, 35)).toEqual({ kind: 'under', message: '33 h / 35 h — il manque 2 h' });
    const over = contractStatus(37 * 60 + 30, 35);
    expect(over.kind).toBe('over');
    expect(over.message).toContain('2 h 30 de trop');
    expect(over.message).toContain("demande d'heures supplémentaires");
  });

  it('formate les durées', () => {
    expect(formatMinutes(480)).toBe('8 h');
    expect(formatMinutes(465)).toBe('7 h 45');
  });
});
