import { colorFor, fullName, tint, USER_PALETTE } from './user-color';

describe('user-color', () => {
  it('donne une couleur stable par id', () => {
    expect(colorFor(3)).toBe(colorFor(3));
    expect(colorFor(1)).not.toBe(colorFor(2));
    expect(colorFor(USER_PALETTE.length)).toBe(USER_PALETTE[0]);
  });

  it('éclaircit une couleur', () => {
    expect(tint('#000000', 0.5)).toBe('#808080');
    expect(tint('#ffffff')).toBe('#ffffff');
  });

  it('affiche prénom nom, ou l’email à défaut', () => {
    expect(fullName({ firstName: 'Alice', lastName: 'Martin', email: 'a@x.fr' })).toBe('Alice Martin');
    expect(fullName({ firstName: null, lastName: null, email: 'a@x.fr' })).toBe('a@x.fr');
  });
});
