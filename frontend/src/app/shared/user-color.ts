import { signal } from '@angular/core';

/** Palette fixe, contrastée sur fond clair. */
export const USER_PALETTE = [
  '#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00897b',
  '#d81b60', '#3949ab', '#6d4c41', '#7cb342', '#00acc1', '#5e35b1',
] as const;

/** Rang de chaque employé par ancienneté (id croissant) : couleurs stables, toutes distinctes jusqu'à 12 personnes. */
const ranks = signal<ReadonlyMap<number, number>>(new Map());

export function setUserColors(userIds: number[]): void {
  ranks.set(new Map([...userIds].sort((a, b) => a - b).map((id, rank) => [id, rank])));
}

export function colorFor(userId: number): string {
  return USER_PALETTE[(ranks().get(userId) ?? Math.abs(userId)) % USER_PALETTE.length];
}

/** Version éclaircie d'une couleur #rrggbb (mélange avec du blanc), pour les absences. */
export function tint(hex: string, ratio = 0.65): string {
  const channel = (i: number) => {
    const value = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(value + (255 - value) * ratio)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function fullName(user: { firstName?: string | null; lastName?: string | null; email: string }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}
