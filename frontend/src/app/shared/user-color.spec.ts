import { colorFor, fullName, setUserColors, tint, USER_PALETTE } from './user-color';

describe('user-color', () => {
  it('12 employés = 12 couleurs, même avec des id espacés de 12 ; un nouvel arrivant ne change rien', () => {
    const ids = [13, 1, 2, 25, 14, 3, 4, 15, 16, 5, 6, 7];
    setUserColors(ids);
    expect(new Set(ids.map(colorFor)).size).toBe(USER_PALETTE.length);
    const before = ids.map(colorFor);
    setUserColors([...ids, 99]);
    expect(ids.map(colorFor)).toEqual(before);
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
