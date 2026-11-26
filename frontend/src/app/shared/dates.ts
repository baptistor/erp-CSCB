const pad = (n: number) => String(n).padStart(2, '0');

/** Date locale -> 'YYYY-MM-DD' (sans passer par l'UTC). */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date locale -> 'HH:mm'. */
export function toHHmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'YYYY-MM-DD' + n jours. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
}

/** Message lisible d'une erreur HTTP (ProblemDetail.detail si présent). */
export function errorMessage(error: unknown, fallback = 'Une erreur est survenue'): string {
  const detail = (error as { error?: { detail?: unknown } } | null)?.error?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

function parseIso(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** 'YYYY-MM-DD' -> « ven. 27 nov. » (année ajoutée si différente de celle de `today`). */
export function formatShortDate(isoDate: string, today = new Date()): string {
  const date = parseIso(isoDate);
  return (date.getFullYear() === today.getFullYear() ? SHORT_DATE : SHORT_DATE_YEAR).format(date);
}

const RELATIVE = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/** Date (ISO, avec ou sans heure) -> « aujourd’hui », « hier », « il y a 3 jours »… */
export function formatRelativeDay(iso: string, today = new Date()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(parseIso(iso)) - start(today)) / 86_400_000);
  return RELATIVE.format(days, 'day');
}
