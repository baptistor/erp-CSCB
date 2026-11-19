import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { UserSummary } from '../../api/models';
import { colorFor, fullName } from '../../shared/user-color';

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

/** « Tout le monde » + une case par collaborateur (à sa couleur) pour afficher / masquer son emploi du temps. */
@Component({
  selector: 'app-people-filter',
  imports: [MatButtonModule, MatCheckboxModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter" role="group" aria-label="Emplois du temps affichés">
      <span class="label">Afficher :</span>
      <button mat-stroked-button type="button" (click)="toggleAll()">
        {{ allSelected() ? 'Seulement moi' : 'Tout le monde' }}
      </button>
      @for (user of others(); track user.id) {
        <mat-checkbox [checked]="selected().has(user.id)" (change)="toggle(user.id, $event.checked)"
                      [style.--mat-checkbox-selected-icon-color]="color(user.id)"
                      [style.--mat-checkbox-selected-focus-icon-color]="color(user.id)"
                      [style.--mat-checkbox-selected-hover-icon-color]="color(user.id)">
          <span class="name"><span class="dot" [style.background]="color(user.id)"></span>{{ name(user) }}</span>
        </mat-checkbox>
      }
    </div>
  `,
  styles: `
    .filter { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
    .label { font: var(--mat-sys-label-large); color: var(--mat-sys-on-surface-variant); }
    .name { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  `,
})
export class PeopleFilter {
  readonly users = input.required<UserSummary[]>();
  readonly meId = input.required<number | null>();
  readonly selected = input.required<ReadonlySet<number>>();
  readonly selectedChange = output<Set<number>>();

  protected readonly others = computed(() => this.users().filter((u) => u.id !== this.meId()));
  protected readonly allSelected = computed(
    () => this.others().length > 0 && this.others().every((u) => this.selected().has(u.id)),
  );
  protected readonly color = colorFor;
  protected readonly name = fullName;

  protected toggleAll(): void {
    this.emit(this.allSelected() ? new Set() : new Set(this.others().map((u) => u.id)));
  }

  protected toggle(id: number, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(id);
    else next.delete(id);
    this.emit(next);
  }

  private emit(ids: Set<number>): void {
    saveVisible([...ids]);
    this.selectedChange.emit(ids);
  }
}
