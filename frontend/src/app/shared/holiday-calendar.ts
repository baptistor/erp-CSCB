import { computed, inject, Injectable, resource } from '@angular/core';
import { Api } from '../api/api';
import { getSchoolHolidayCalendar, validateSchoolHolidayCalendar } from '../api/functions';
import { SchoolHolidayCalendar } from '../api/models';
import { AuthService } from '../core/auth/auth.service';

const LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** « 31 mai 2027 ». */
export function longDate(date: string): string {
  return LONG.format(parse(date));
}

/** Dernier jour du mois de `date` (AAAA-MM-JJ). */
export function endOfMonth(date: string): string {
  const d = parse(date);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

/** Avertissement à afficher à l'admin (spec §1 : calendrier validé au moins 6 mois à l'avance), ou null. */
export function holidayWarning(cal: SchoolHolidayCalendar): string | null {
  if (!cal.late) return null;
  const required = longDate(cal.requiredUntil);
  return cal.validatedUntil
    ? `Calendrier des vacances scolaires validé jusqu'au ${longDate(cal.validatedUntil)} seulement : validez-le au moins jusqu'au ${required}.`
    : `Calendrier des vacances scolaires non validé : validez-le au moins jusqu'au ${required}.`;
}

/** Date proposée par défaut pour valider : fin du mois qui atteint les 6 mois. */
export function suggestedValidation(cal: SchoolHolidayCalendar): string {
  return endOfMonth(cal.requiredUntil);
}

/** État de validation du calendrier des vacances, partagé (menu, planning, onglet admin). Admin uniquement. */
@Injectable({ providedIn: 'root' })
export class HolidayCalendarStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);

  readonly state = resource({
    params: () => (this.auth.isAdmin() ? {} : undefined),
    loader: () => this.api.invoke(getSchoolHolidayCalendar),
  });
  readonly calendar = computed(() => (this.state.hasValue() ? this.state.value() : null));
  readonly warning = computed(() => {
    const cal = this.calendar();
    return cal ? holidayWarning(cal) : null;
  });

  async validate(validatedUntil: string): Promise<void> {
    this.state.set(await this.api.invoke(validateSchoolHolidayCalendar, { body: { validatedUntil } }));
  }
}
