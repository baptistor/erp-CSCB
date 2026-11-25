import { computed, inject, Injectable, signal } from '@angular/core';
import { Api } from '../../api/api';
import { getUsers } from '../../api/functions';
import { UserSummary } from '../../api/models';
import { AuthService } from '../../core/auth/auth.service';
import { setUserColors } from '../../shared/user-color';

const STORAGE_KEY = 'erp.planning.visible';

/** Collaborateurs affichés mémorisés sur le navigateur (préférence locale, spec §1). */
export function loadVisible(): number[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : null;
  } catch {
    return null;
  }
}

export function saveVisible(ids: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // stockage indisponible : le choix vaut pour la session
  }
}

/**
 * Personnes affichées, dans l'ordre de la grille : soi d'abord (toujours affiché), puis les collaborateurs cochés
 * dans l'ordre de la liste (alphabétique).
 */
export function visiblePeople(users: UserSummary[], meId: number | null, selected: ReadonlySet<number>): UserSummary[] {
  const me = users.filter((u) => u.id === meId);
  return [...me, ...users.filter((u) => u.id !== meId && selected.has(u.id))];
}

/** Choix des emplois du temps affichés, partagé entre le menu de gauche (liste à cocher) et le planning. */
@Injectable({ providedIn: 'root' })
export class PeopleStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);

  readonly users = signal<UserSummary[]>([]);
  readonly selected = signal<ReadonlySet<number>>(new Set(loadVisible() ?? []));
  readonly meId = computed(() => this.auth.currentUser()?.id ?? null);
  readonly me = computed(() => this.users().find((u) => u.id === this.meId()));
  readonly others = computed(() => this.users().filter((u) => u.id !== this.meId()));
  readonly people = computed(() => visiblePeople(this.users(), this.meId(), this.selected()));
  readonly allSelected = computed(
    () => this.others().length > 0 && this.others().every((u) => this.selected().has(u.id)),
  );

  async load(): Promise<void> {
    const users = await this.api.invoke(getUsers);
    setUserColors(users.map((u) => u.id));
    this.users.set(users);
  }

  toggleAll(): void {
    this.select(this.allSelected() ? new Set() : new Set(this.others().map((u) => u.id)));
  }

  toggle(id: number, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(id);
    else next.delete(id);
    this.select(next);
  }

  private select(ids: Set<number>): void {
    saveVisible([...ids]);
    this.selected.set(ids);
  }
}
