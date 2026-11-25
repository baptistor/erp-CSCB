import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
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
  imports: [MatTabsModule, TypicalWeekForm, SpecialDaysAdmin, SchoolHolidaysAdmin, BalancesAdmin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Édition des plannings</h1>
    <mat-tab-group>
      <mat-tab label="Horaires">
        <app-typical-week-form (userChange)="selectUser($event)" />
        @if (selectedUser(); as user) {
          <app-special-days-admin [user]="user" />
        }
      </mat-tab>
      <mat-tab label="Vacances scolaires">
        <app-school-holidays-admin />
      </mat-tab>
      <mat-tab label="Soldes">
        <app-balances-admin />
      </mat-tab>
    </mat-tab-group>
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
