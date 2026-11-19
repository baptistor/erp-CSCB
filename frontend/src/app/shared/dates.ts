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
