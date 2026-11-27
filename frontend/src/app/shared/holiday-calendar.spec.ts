import { endOfMonth, holidayWarning, suggestedValidation } from './holiday-calendar';

const base = { validatedBy: null, validatedAt: null, requiredUntil: '2027-05-27' };

describe('validation du calendrier des vacances', () => {
  it('avertit tant que le calendrier n’est pas validé à 6 mois', () => {
    expect(holidayWarning({ ...base, validatedUntil: null, late: true })).toBe(
      "Calendrier des vacances scolaires non validé : validez-le au moins jusqu'au 27 mai 2027.",
    );
    expect(holidayWarning({ ...base, validatedUntil: '2027-03-15', late: true })).toContain(
      'validé jusqu\'au 15 mars 2027 seulement',
    );
    expect(holidayWarning({ ...base, validatedUntil: '2027-05-31', late: false })).toBeNull();
  });

  it('propose de valider jusqu’à la fin du mois des 6 mois', () => {
    expect(suggestedValidation({ ...base, validatedUntil: null, late: true })).toBe('2027-05-31');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });
});
