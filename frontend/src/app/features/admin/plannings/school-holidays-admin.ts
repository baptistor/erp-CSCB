import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { ZardCardImports } from '@/shared/components/card';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardToggleComponent } from '@/shared/components/toggle';
import { Api } from '../../../api/api';
import { getSchoolHolidayWeeks, markSchoolHolidayWeek, unmarkSchoolHolidayWeek } from '../../../api/functions';
import { addDays, errorMessage, toIsoDate } from '../../../shared/dates';
import { weekDays } from '../../planning/week-grid-layout';

const WEEKS = 52;
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lundis des `count` semaines à venir (la semaine en cours n'est plus modifiable), groupés par mois. */
export function upcomingWeeks(today: string, count: number): { month: string; mondays: string[] }[] {
  const groups: { month: string; mondays: string[] }[] = [];
  const first = addDays(weekDays(parse(today))[0], 7);
  for (let i = 0; i < count; i++) {
    const monday = addDays(first, i * 7);
    const month = MONTH.format(parse(monday));
    if (groups.at(-1)?.month !== month) groups.push({ month, mondays: [] });
    groups.at(-1)!.mondays.push(monday);
  }
  return groups;
}

/** Admin : marquer à l'avance les semaines de vacances scolaires, communes à tous (spec §1). */
@Component({
  selector: 'app-school-holidays-admin',
  imports: [ZardCardImports, ZardSkeletonComponent, ZardToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="max-w-2xl text-sm text-muted-foreground">
        Sélectionnez les semaines de vacances scolaires : les horaires « vacances » de chaque employé s'y appliquent.
        La semaine en cours et les semaines passées ne sont plus modifiables.
      </p>
      @if (marked.hasValue()) {
        <span class="text-sm"><strong class="tabular-nums">{{ markedCount() }}</strong> semaine{{ markedCount() > 1 ? 's' : '' }}
          marquée{{ markedCount() > 1 ? 's' : '' }} sur {{ total }}</span>
      }
    </div>
    @if (marked.hasValue()) {
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (group of groups; track group.month) {
          <z-card zSize="sm">
            <z-card-header>
              <z-card-title class="first-letter:uppercase">{{ group.month }}</z-card-title>
            </z-card-header>
            <z-card-content class="flex flex-col gap-1.5">
              @for (monday of group.mondays; track monday) {
                <z-toggle zType="outline" zSize="sm" class="w-full justify-start font-normal data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:font-medium data-[state=on]:text-primary"
                          [zValue]="isMarked(monday)" [zDisabled]="saving()"
                          [zAriaLabel]="'Vacances scolaires, semaine du ' + label(monday)"
                          (zToggleChange)="toggle(monday, $event)">
                  {{ label(monday) }}
                </z-toggle>
              }
            </z-card-content>
          </z-card>
        }
      </div>
    } @else if (marked.error()) {
      <p class="text-sm text-destructive">Impossible de charger les semaines de vacances.</p>
    } @else {
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (i of [1, 2, 3, 4, 5, 6]; track i) { <z-skeleton class="h-48 rounded-xl" /> }
      </div>
    }
  `,
})
export class SchoolHolidaysAdmin {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly groups = upcomingWeeks(toIsoDate(new Date()), WEEKS);
  protected readonly saving = signal(false);
  protected readonly marked = resource({ loader: () => this.api.invoke(getSchoolHolidayWeeks) });
  private readonly markedSet = computed(() => new Set(this.marked.hasValue() ? this.marked.value() : []));
  protected readonly total = WEEKS;
  /** Semaines marquées parmi celles affichées (les passées ne comptent plus). */
  protected readonly markedCount = computed(
    () => this.groups.flatMap((g) => g.mondays).filter((monday) => this.markedSet().has(monday)).length,
  );

  protected isMarked(monday: string): boolean {
    return this.markedSet().has(monday);
  }

  protected label(monday: string): string {
    return `${SHORT.format(parse(monday))} – ${SHORT.format(parse(addDays(monday, 6)))}`;
  }

  protected async toggle(weekStart: string, checked: boolean): Promise<void> {
    this.saving.set(true);
    try {
      await this.api.invoke(checked ? markSchoolHolidayWeek : unmarkSchoolHolidayWeek, { weekStart });
      this.toast.success(checked ? 'Semaine marquée « vacances scolaires »' : 'Semaine redevenue classique', {
        duration: 3000,
      });
    } catch (error) {
      this.toast.error(errorMessage(error), { duration: 8000 });
    }
    this.saving.set(false);
    this.marked.reload();
  }
}
