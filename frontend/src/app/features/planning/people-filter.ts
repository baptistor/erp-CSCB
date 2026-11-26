import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronUp, lucideSearch } from '@ng-icons/lucide';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCheckboxComponent } from '@/shared/components/checkbox';
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
  imports: [FormsModule, NgIcon, ZardButtonComponent, ZardCheckboxComponent],
  viewProviders: [provideIcons({ lucideChevronDown, lucideChevronUp, lucideSearch })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="flex items-center justify-between rounded-md p-2 text-sm font-medium hover:bg-sidebar-accent"
            type="button" [attr.aria-expanded]="open()" (click)="open.set(!open())">
      <span>Emplois du temps</span>
      <ng-icon [name]="open() ? 'lucideChevronUp' : 'lucideChevronDown'" />
    </button>
    @if (open()) {
      <label class="mx-2 flex items-center gap-2 rounded-md border bg-background px-2 text-muted-foreground
                    focus-within:ring-2 focus-within:ring-ring/50">
        <ng-icon name="lucideSearch" class="shrink-0" />
        <input type="search" placeholder="Rechercher" aria-label="Rechercher un collaborateur"
               class="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
               [value]="query()" (input)="query.set($any($event.target).value)" />
      </label>
      <button z-button zType="ghost" zSize="sm" type="button" class="mt-1 ml-1 self-start" (click)="store.toggleAll()">
        {{ store.allSelected() ? 'Seulement moi' : 'Tout le monde' }}
      </button>
      <div class="flex min-h-20 flex-col gap-2 overflow-y-auto px-2 py-1" role="group" aria-label="Emplois du temps affichés">
        @for (user of results(); track user.id) {
          <!-- la couleur de la case est celle de la personne dans le planning -->
          <z-checkbox [ngModel]="isMe(user) || store.selected().has(user.id)" [zDisabled]="isMe(user)"
                      (checkChange)="store.toggle(user.id, $event)"
                      [style.--primary]="color(user.id)" [style.--input]="color(user.id)" class="disabled:opacity-100">
            <span class="truncate text-sm" [title]="name(user)">{{ name(user) }}{{ isMe(user) ? ' (moi)' : '' }}</span>
          </z-checkbox>
        } @empty {
          <p class="m-2 text-xs text-muted-foreground">Aucun résultat</p>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; padding: 4px 8px 8px; }
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
