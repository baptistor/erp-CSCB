import { searchPeople } from './people-filter';
import { loadVisible, saveVisible, visiblePeople } from './people-store';

describe('people-filter', () => {
  const users = [
    { id: 4, email: 'c@x.fr', firstName: 'Chloé', lastName: 'Bernard' },
    { id: 3, email: 'b@x.fr', firstName: 'Bruno', lastName: 'Durand' },
    { id: 2, email: 'a@x.fr', firstName: 'Alice', lastName: 'Martin' },
  ];

  it('par défaut, seulement moi', () => {
    expect(visiblePeople(users, 2, new Set()).map((u) => u.id)).toEqual([2]);
  });

  it('moi en premier, puis les cochés dans l’ordre de la liste', () => {
    expect(visiblePeople(users, 2, new Set([3, 4])).map((u) => u.id)).toEqual([2, 4, 3]);
  });

  it('recherche par nom ou prénom, sans accents ni majuscules', () => {
    expect(searchPeople(users, 'CHLOE').map((u) => u.id)).toEqual([4]);
    expect(searchPeople(users, 'martin ali').map((u) => u.id)).toEqual([2]);
    expect(searchPeople(users, ' ').length).toBe(3);
    expect(searchPeople(users, 'zz')).toEqual([]);
  });

  it('mémorise le choix sur le navigateur', () => {
    localStorage.clear();
    expect(loadVisible()).toBeNull();
    saveVisible([3, 4]);
    expect(loadVisible()).toEqual([3, 4]);
  });
});
