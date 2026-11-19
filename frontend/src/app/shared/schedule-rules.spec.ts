import {
  absenceSelectionAllowed,
  canEditDay,
  contractStatus,
  formatMinutes,
  isValidWeeklyHours,
  rangeError,
} from './schedule-rules';

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
    expect(over.message).toContain("déclaration d'heures supplémentaires");
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

describe('absenceSelectionAllowed', () => {
  const today = '2026-11-19';
  const myDays = new Map([
    ['2026-11-19', { start: '09:00', end: '17:00' }],
    ['2026-11-20', { start: '09:00', end: '17:00' }],
  ]);

  it('accepte une plage comprise dans ma journée', () => {
    expect(absenceSelectionAllowed(myDays, { allDay: false, date: '2026-11-20', start: '14:00', end: '16:00' }, today)).toBe(true);
    expect(absenceSelectionAllowed(myDays, { allDay: false, date: '2026-11-20', start: '09:00', end: '17:00' }, today)).toBe(true);
  });

  it('refuse une plage qui déborde de mes horaires ou un jour non travaillé', () => {
    expect(absenceSelectionAllowed(myDays, { allDay: false, date: '2026-11-20', start: '08:00', end: '10:00' }, today)).toBe(false);
    expect(absenceSelectionAllowed(myDays, { allDay: false, date: '2026-11-21', start: '10:00', end: '12:00' }, today)).toBe(false);
  });

  it('refuse le passé', () => {
    const past = new Map([['2026-11-18', { start: '09:00', end: '17:00' }]]);
    expect(absenceSelectionAllowed(past, { allDay: false, date: '2026-11-18', start: '10:00', end: '12:00' }, today)).toBe(false);
  });

  it('journées entières : au moins un jour travaillé', () => {
    expect(absenceSelectionAllowed(myDays, { allDay: true, startDate: '2026-11-20', endDateExclusive: '2026-11-23' }, today)).toBe(true);
    expect(absenceSelectionAllowed(myDays, { allDay: true, startDate: '2026-11-21', endDateExclusive: '2026-11-23' }, today)).toBe(false);
  });
});
