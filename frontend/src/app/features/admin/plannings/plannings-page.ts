import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ZardTabsImports } from '@/shared/components/tabs';
import { PageHeader } from '../../../shared/page-header';
import { Api } from '../../../api/api';
import { getUsers } from '../../../api/functions';
import { UserSummary } from '../../../api/models';
import { BalancesAdmin } from './balances-admin';
import { SchoolHolidaysAdmin } from './school-holidays-admin';
import { SpecialDaysAdmin } from './special-days-admin';
import { TypicalWeekForm } from './typical-week-form';

/**
 * /admin/plannings : semaines type, contrat, vacances scolaires et heures ajoutées à venir de chaque employé, soldes (spec).
 * Pas de calendrier éditable ici : depuis le planning, chacun n'agit que sur son propre emploi du temps.
 */
@Component({
  selector: 'app-plannings-page',
  imports: [PageHeader, ZardTabsImports, TypicalWeekForm, SpecialDaysAdmin, SchoolHolidaysAdmin, BalancesAdmin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mx-auto flex max-w-5xl flex-col gap-6' },
  template: `
    <app-page-header title="Édition des plannings"
                     description="Semaines type et contrats, vacances scolaires et soldes d'heures de l'équipe." />
    <z-tab-group>
      <z-tab label="Horaires">
        <div class="flex flex-col gap-6 pt-6">
          <app-typical-week-form (userChange)="selectUser($event)" />
          @if (selectedUser(); as user) {
            <app-special-days-admin [user]="user" />
          }
        </div>
      </z-tab>
      <z-tab label="Vacances scolaires">
        <div class="pt-6"><app-school-holidays-admin /></div>
      </z-tab>
      <z-tab label="Soldes">
        <div class="pt-6"><app-balances-admin /></div>
      </z-tab>
    </z-tab-group>
  `,
})
export class PlanningsPage {
  private readonly api = inject(Api);
  private readonly users = signal<UserSummary[]>([]);
  protected readonly selectedUser = signal<UserSummary | null>(null);
  private pendingId: number | null = null;

  constructor() {
    void this.api.invoke(getUsers).then((users) => {
      this.users.set(users);
      if (this.pendingId != null) this.selectUser(this.pendingId);
    });
  }

  protected selectUser(id: number): void {
    this.pendingId = id;
    this.selectedUser.set(this.users().find((u) => u.id === id) ?? null);
  }
}
