import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideInbox, lucideX } from '@ng-icons/lucide';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogService } from '@/shared/components/dialog';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardItemImports } from '@/shared/components/item';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardTabsImports } from '@/shared/components/tabs';
import { ZardTooltipImports } from '@/shared/components/tooltip';
import { Api } from '../../../api/api';
import { decideAbsence, decideOvertime, getPendingRequests, getUsers } from '../../../api/functions';
import { AbsenceRequest, OvertimeRequest, Requests, UserSummary } from '../../../api/models';
import { errorMessage, formatRelativeDay, formatShortDate } from '../../../shared/dates';
import { openDialog } from '../../../shared/dialogs';
import { PageHeader } from '../../../shared/page-header';
import { ABSENCE_TYPE_LABELS, formatHours } from '../../../shared/requests';
import { fullName, setUserColors } from '../../../shared/user-color';
import { UserAvatar } from '../../../shared/user-avatar';
import { DecisionDialog, DecisionDialogData, DecisionDialogResult } from './decision-dialog';

const SHORT_TYPE: Record<AbsenceRequest['type'], string> = { RECUP_HEURES_SUP: 'Récup', SANS_SOLDE: 'Sans solde' };

/** /admin/validations : demandes PENDING de tous, à approuver ou refuser (boîte de réception). */
@Component({
  selector: 'app-validations-page',
  imports: [
    NgIcon,
    PageHeader,
    UserAvatar,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCardImports,
    ZardEmptyComponent,
    ZardItemImports,
    ZardSkeletonComponent,
    ZardTabsImports,
    ZardTooltipImports,
  ],
  viewProviders: [provideIcons({ lucideCheck, lucideInbox, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mx-auto flex max-w-5xl flex-col gap-8' },
  template: `
    <app-page-header title="Validations"
                     description="Demandes en attente de toute l'équipe. Une décision est notifiée au demandeur." />

    <z-card>
      <z-card-content>
        @if (pending(); as p) {
          <z-tab-group>
            <z-tab [label]="'Heures supplémentaires · ' + p.overtimes.length">
              <div class="pt-4">
                @if (p.overtimes.length) {
                  <div z-item-group class="gap-0">
                    @for (o of p.overtimes; track o.id; let last = $last) {
                      <div z-item>
                        <div z-item-media>
                          @if (user(o.userId); as u) { <app-user-avatar [user]="u" /> }
                        </div>
                        <div z-item-content>
                          <div z-item-title>{{ name(o.userId) }}</div>
                          <p z-item-description>
                            {{ date(o.date) }} · {{ o.reason }}
                            @if (o.createdAt) { · demandée {{ ago(o.createdAt) }} }
                          </p>
                        </div>
                        <span class="w-16 text-right text-sm font-medium tabular-nums">{{ hours(o.hours) }}</span>
                        <div z-item-actions>
                          <button z-button zType="ghost" zSize="icon-sm" type="button" aria-label="Refuser" zTooltip="Refuser"
                                  class="hover:bg-destructive/10 hover:text-destructive" (click)="decideOvertime(o, false)">
                            <ng-icon name="lucideX" />
                          </button>
                          <button z-button zType="outline" zSize="sm" type="button" (click)="decideOvertime(o, true)">
                            <ng-icon name="lucideCheck" /> Approuver
                          </button>
                        </div>
                      </div>
                      @if (!last) { <div z-item-separator class="my-0"></div> }
                    }
                  </div>
                } @else {
                  <z-empty zIcon="lucideInbox" zTitle="Tout est traité"
                           zDescription="Aucune déclaration d'heures supplémentaires en attente." />
                }
              </div>
            </z-tab>
            <z-tab [label]="'Absences · ' + p.absences.length">
              <div class="pt-4">
                @if (p.absences.length) {
                  <div z-item-group class="gap-0">
                    @for (a of p.absences; track a.id; let last = $last) {
                      <div z-item>
                        <div z-item-media>
                          @if (user(a.userId); as u) { <app-user-avatar [user]="u" /> }
                        </div>
                        <div z-item-content>
                          <div z-item-title>
                            {{ name(a.userId) }}
                            <z-badge [zType]="a.type === 'SANS_SOLDE' ? 'outline' : 'secondary'">{{ shortType[a.type] }}</z-badge>
                          </div>
                          <p z-item-description>
                            {{ period(a) }}
                            @if (a.comment) { · « {{ a.comment }} » }
                            @if (a.createdAt) { · demandée {{ ago(a.createdAt) }} }
                          </p>
                        </div>
                        <span class="w-16 text-right text-sm font-medium tabular-nums">{{ hours(a.hours) }}</span>
                        <div z-item-actions>
                          <button z-button zType="ghost" zSize="icon-sm" type="button" aria-label="Refuser" zTooltip="Refuser"
                                  class="hover:bg-destructive/10 hover:text-destructive" (click)="decideAbsence(a, false)">
                            <ng-icon name="lucideX" />
                          </button>
                          <button z-button zType="outline" zSize="sm" type="button" (click)="decideAbsence(a, true)">
                            <ng-icon name="lucideCheck" /> Approuver
                          </button>
                        </div>
                      </div>
                      @if (!last) { <div z-item-separator class="my-0"></div> }
                    }
                  </div>
                } @else {
                  <z-empty zIcon="lucideInbox" zTitle="Tout est traité" zDescription="Aucune absence en attente." />
                }
              </div>
            </z-tab>
          </z-tab-group>
        } @else {
          <div class="flex flex-col gap-3">
            <z-skeleton class="h-8 w-72" />
            @for (i of [1, 2, 3]; track i) { <z-skeleton class="h-14" /> }
          </div>
        }
      </z-card-content>
    </z-card>
  `,
})
export class ValidationsPage {
  private readonly api = inject(Api);
  private readonly dialogs = inject(ZardDialogService);
  private readonly toast = inject(ZardSonnerService);

  protected readonly pending = signal<Requests | null>(null);
  private readonly users = signal<UserSummary[]>([]);
  private readonly usersById = computed(() => new Map(this.users().map((u) => [u.id, u])));
  protected readonly shortType = SHORT_TYPE;
  protected readonly hours = (h: number) => formatHours(h);
  protected readonly date = (iso: string) => formatShortDate(iso);
  protected readonly ago = (iso: string) => formatRelativeDay(iso);

  constructor() {
    void this.api.invoke(getUsers).then((users) => {
      setUserColors(users.map((u) => u.id));
      this.users.set(users);
    });
    void this.reload();
  }

  protected user(userId: number): UserSummary | undefined {
    return this.usersById().get(userId);
  }

  protected name(userId: number): string {
    const user = this.user(userId);
    return user ? fullName(user) : `#${userId}`;
  }

  protected period(a: AbsenceRequest): string {
    if (a.startTime) return `${this.date(a.startDate)} · ${a.startTime}–${a.endTime}`;
    if (a.endDate !== a.startDate) return `${this.date(a.startDate)} → ${this.date(a.endDate)} · journées entières`;
    return `${this.date(a.startDate)} · journée entière`;
  }

  protected async decideOvertime(o: OvertimeRequest, approved: boolean): Promise<void> {
    const summary = `${this.name(o.userId)} — ${formatHours(o.hours)} d'heures sup le ${this.date(o.date)}`;
    const result = await this.confirm(approved, summary);
    if (result) {
      await this.run(() => this.api.invoke(decideOvertime, { id: o.id, body: { approved, comment: result.comment } }), approved);
    }
  }

  protected async decideAbsence(a: AbsenceRequest, approved: boolean): Promise<void> {
    const summary = `${this.name(a.userId)} — ${ABSENCE_TYPE_LABELS[a.type]}, ${formatHours(a.hours)} (${this.period(a)})`;
    const result = await this.confirm(approved, summary);
    if (result) {
      await this.run(() => this.api.invoke(decideAbsence, { id: a.id, body: { approved, comment: result.comment } }), approved);
    }
  }

  private confirm(approved: boolean, summary: string) {
    return openDialog<DecisionDialog, DecisionDialogData, DecisionDialogResult>(this.dialogs, DecisionDialog, {
      approved,
      summary,
    });
  }

  private async run(call: () => Promise<unknown>, approved: boolean): Promise<void> {
    try {
      await call();
      this.toast.success(approved ? 'Demande approuvée' : 'Demande refusée');
    } catch (error) {
      this.toast.error(errorMessage(error), { duration: 8000 });
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.pending.set(await this.api.invoke(getPendingRequests));
    } catch (error) {
      this.toast.error(errorMessage(error, 'Impossible de charger les demandes'), { duration: 6000 });
    }
  }
}
