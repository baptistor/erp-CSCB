import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { UserSummary } from '../../api/models';
import { colorFor, fullName } from '../../shared/user-color';
import { PeopleStore } from './people-store';

const SMALL_SCREEN_PX = 900;

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Recherche par prénom et/ou nom, sans tenir compte des accents ni des majuscules. */
export function searchPeople(users: UserSummary[], query: string): UserSummary[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return users.filter((u) => words.every((word) => normalize(fullName(u)).includes(word)));
}

/** Menu de gauche : recherche + liste à cocher des emplois du temps affichés, comme Google Agenda (spec §1). */
@Component({
  selector: 'app-people-filter',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="head" type="button" [attr.aria-expanded]="open()" (click)="open.set(!open())">
      <span>Emplois du temps</span>
      <mat-icon>{{ open() ? 'expand_less' : 'expand_more' }}</mat-icon>
    </button>
    @if (open()) {
      <label class="search">
        <mat-icon>search</mat-icon>
        <input type="search" placeholder="Rechercher" aria-label="Rechercher un collaborateur"
               [value]="query()" (input)="query.set($any($event.target).value)" />
      </label>
      <button mat-button type="button" class="all" (click)="store.toggleAll()">
        {{ store.allSelected() ? 'Seulement moi' : 'Tout le monde' }}
      </button>
      <div class="list" role="group" aria-label="Emplois du temps affichés">
        @for (user of results(); track user.id) {
          <mat-checkbox [checked]="isMe(user) || store.selected().has(user.id)" [disabled]="isMe(user)"
                        (change)="store.toggle(user.id, $event.checked)"
                        [style.--mat-checkbox-selected-icon-color]="color(user.id)"
                        [style.--mat-checkbox-selected-focus-icon-color]="color(user.id)"
                        [style.--mat-checkbox-selected-hover-icon-color]="color(user.id)"
                        [style.--mat-checkbox-selected-pressed-icon-color]="color(user.id)"
                        [style.--mat-checkbox-disabled-selected-icon-color]="color(user.id)"
                        [style.--mat-checkbox-unselected-icon-color]="color(user.id)"
                        [style.--mat-checkbox-disabled-label-color]="'var(--mat-sys-on-surface)'">
            <span class="name" [title]="name(user)">{{ name(user) }}{{ isMe(user) ? ' (moi)' : '' }}</span>
          </mat-checkbox>
        } @empty {
          <p class="empty">Aucun résultat</p>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; padding: 4px 8px 8px; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 8px; border: none; cursor: pointer;
      background: none; color: inherit; font: var(--mat-sys-title-small); }
    .search { display: flex; align-items: center; gap: 4px; margin: 0 8px; padding: 0 8px; border-radius: 18px;
      background: var(--mat-sys-surface-container-high); color: var(--mat-sys-on-surface-variant); }
    .search:focus-within { outline: 2px solid var(--mat-sys-primary); }
    .search mat-icon { flex: none; width: 20px; height: 20px; font-size: 20px; }
    .search input { flex: 1; min-width: 0; height: 36px; border: none; outline: none; background: none; color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-medium); }
    .all { align-self: flex-start; margin: 4px 0 0 4px; }
    .list { display: flex; flex-direction: column; min-height: 80px; overflow-y: auto; }
    mat-checkbox { --mat-checkbox-state-layer-size: 34px; }
    .name { font: var(--mat-sys-body-medium); }
    .empty { margin: 8px; color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
  `,
})
export class PeopleFilter {
  protected readonly store = inject(PeopleStore);
  protected readonly open = signal(window.innerWidth >= SMALL_SCREEN_PX);
  protected readonly query = signal('');
  /** Soi d'abord (toujours affiché), puis les autres dans l'ordre alphabétique. */
  protected readonly results = computed(() => {
    const me = this.store.me();
    return searchPeople(me ? [me, ...this.store.others()] : this.store.others(), this.query());
  });
  protected readonly color = colorFor;
  protected readonly name = fullName;

  protected isMe(user: UserSummary): boolean {
    return user.id === this.store.meId();
  }
}
