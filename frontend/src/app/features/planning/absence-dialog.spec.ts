import { recupExceedsAvailable } from './absence-dialog';

describe('recupExceedsAvailable', () => {
  it('bloque une récup au-delà du disponible', () => {
    expect(recupExceedsAvailable('RECUP_HEURES_SUP', 3, 2)).toBe(true);
    expect(recupExceedsAvailable('RECUP_HEURES_SUP', 2, 2)).toBe(false);
  });

  it("n'applique pas le solde au sans solde", () => {
    expect(recupExceedsAvailable('SANS_SOLDE', 40, 0)).toBe(false);
  });
});
