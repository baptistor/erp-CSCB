import { upcomingWeeks } from './school-holidays-admin';

describe('upcomingWeeks', () => {
  it('commence le lundi suivant et groupe par mois', () => {
    expect(upcomingWeeks('2026-11-25', 3)).toEqual([
      { month: 'novembre 2026', mondays: ['2026-11-30'] },
      { month: 'décembre 2026', mondays: ['2026-12-07', '2026-12-14'] },
    ]);
  });
});
