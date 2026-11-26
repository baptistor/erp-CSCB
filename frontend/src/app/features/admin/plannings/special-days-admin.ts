import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarPlus, lucideEllipsis, lucidePlus } from '@ng-icons/lucide';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogService } from '@/shared/components/dialog';
import { ZardDropdownImports } from '@/shared/components/dropdown';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardItemImports } from '@/shared/components/item';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api } from '../../../api/api';
import { createSpecialDay, deleteSpecialDay, getPlanning, updateSpecialDay } from '../../../api/functions';
import { PlanningDay, UserSummary } from '../../../api/models';
import { addDays, errorMessage, toIsoDate } from '../../../shared/dates';
import { openDialog } from '../../../shared/dialogs';
import { defaultExtra, formatMinutes, toMinutes } from '../../../shared/schedule-rules';
import { DayDialog, DayDialogData, DayDialogResult } from '../../planning/day-dialog';

const HORIZON_DAYS = 62;
const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Admin : heures ajoutées à venir d'un employé (ajout / modification / retrait), en dehors de sa journée type. */
@Component({
  selector: 'app-special-days-admin',
  imports: [NgIcon, ZardButtonComponent, ZardCardImports, ZardDropdownImports, ZardEmptyComponent, ZardItemImports],
  viewProviders: [provideIcons({ lucideCalendarPlus, lucideEllipsis, lucidePlus })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-card>
      <z-card-header>
        <z-card-title>Heures ajoutées à venir</z-card-title>
        <z-card-description>Plages exceptionnelles des {{ horizon }} prochains jours, en dehors de la semaine type.</z-card-description>
        <z-card-action>
          <button z-button zType="outline" zSize="sm" type="button" (click)="add()"><ng-icon name="lucidePlus" /> Ajouter</button>
        </z-card-action>
      </z-card-header>
      <z-card-content>
        @if (specialDays().length) {
          <div z-item-group class="gap-0">
            @for (d of specialDays(); track d.date + d.startTime; let last = $last) {
              <div z-item zSize="sm">
                <div z-item-content>
                  <div z-item-title class="first-letter:uppercase">{{ longDate(d.date) }}</div>
                  <p z-item-description>{{ d.startTime }}–{{ d.endTime }}</p>
                </div>
                <span class="text-sm font-medium tabular-nums">+ {{ length(d) }}</span>
                <button z-button zType="ghost" zSize="icon-sm" type="button" aria-label="Actions" z-dropdown [zDropdownMenu]="menu">
                  <ng-icon name="lucideEllipsis" />
                </button>
                <z-dropdown-menu-content #menu="zDropdownMenuContent" zAlign="end" class="w-40">
                  <z-dropdown-menu-item (click)="edit(d)">Modifier</z-dropdown-menu-item>
                  <z-dropdown-menu-item zType="destructive" (click)="remove(d)">Retirer</z-dropdown-menu-item>
                </z-dropdown-menu-content>
              </div>
              @if (!last) { <div z-item-separator class="my-0"></div> }
            }
          </div>
        } @else if (planning.hasValue()) {
          <z-empty zIcon="lucideCalendarPlus" zTitle="Aucune heure ajoutée"
                   zDescription="La semaine type s'applique telle quelle sur les {{ horizon }} prochains jours." />
        }
      </z-card-content>
    </z-card>
  `,
})
export class SpecialDaysAdmin {
  readonly user = input.required<UserSummary>();

  private readonly api = inject(Api);
  private readonly dialogs = inject(ZardDialogService);
  private readonly toast = inject(ZardSonnerService);

  protected readonly horizon = HORIZON_DAYS;
  private readonly today = toIsoDate(new Date());

  protected readonly planning = resource({
    params: () => ({ userId: this.user().id }),
    loader: () => this.api.invoke(getPlanning, { from: this.today, to: addDays(this.today, HORIZON_DAYS) }),
  });

  protected readonly specialDays = computed(() =>
    this.planning.hasValue()
      ? this.planning.value().days.filter((d) => d.userId === this.user().id && d.specialDayId != null)
      : [],
  );

  protected length(day: PlanningDay): string {
    return formatMinutes(toMinutes(day.endTime) - toMinutes(day.startTime));
  }

  protected longDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return LONG_DATE.format(new Date(y, m - 1, d));
  }

  protected async add(): Promise<void> {
    const { start, end } = defaultExtra(this.day(this.today).typical);
    const result = await this.open({ date: this.today, startTime: start, endTime: end });
    if (result?.action === 'save') {
      await this.run(() => this.api.invoke(createSpecialDay, { body: result.input }), 'Heures ajoutées');
    }
  }

  protected async edit(day: PlanningDay): Promise<void> {
    const id = day.specialDayId!;
    const result = await this.open({ date: day.date, startTime: day.startTime, endTime: day.endTime }, id);
    if (result?.action === 'save') {
      await this.run(() => this.api.invoke(updateSpecialDay, { id, body: result.input }), 'Heures ajoutées modifiées');
    } else if (result?.action === 'remove') {
      await this.remove(day);
    }
  }

  protected async remove(day: PlanningDay): Promise<void> {
    const id = day.specialDayId!;
    await this.run(() => this.api.invoke(deleteSpecialDay, { id }), 'Heures ajoutées retirées');
  }

  private day(date: string, ignoredId?: number): ReturnType<DayDialogData['dayOf']> {
    const days = this.planning.hasValue()
      ? this.planning.value().days.filter((d) => d.userId === this.user().id && d.date === date)
      : [];
    return {
      typical: days.filter((d) => d.specialDayId == null).map((d) => ({ start: d.startTime, end: d.endTime })),
      others: days
        .filter((d) => d.specialDayId != null && d.specialDayId !== ignoredId)
        .map((d) => ({ start: d.startTime, end: d.endTime })),
    };
  }

  private open(initial: DayDialogData['initial'], extraId?: number): Promise<DayDialogResult | undefined> {
    const data: DayDialogData = {
      user: this.user(),
      initial,
      existing: extraId != null,
      dayOf: (date) => this.day(date, extraId),
    };
    return openDialog<DayDialog, DayDialogData, DayDialogResult>(this.dialogs, DayDialog, data);
  }

  private async run(call: () => Promise<unknown>, success: string): Promise<void> {
    try {
      await call();
      this.toast.success(success);
    } catch (error) {
      this.toast.error(errorMessage(error), { duration: 8000 });
    }
    this.planning.reload();
  }
}
