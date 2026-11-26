import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarX, lucideClock, lucideClockPlus, lucideEllipsis, lucideHourglass } from '@ng-icons/lucide';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogService } from '@/shared/components/dialog';
import { ZardDropdownImports } from '@/shared/components/dropdown';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardItemImports } from '@/shared/components/item';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardTabsImports } from '@/shared/components/tabs';
import { Api } from '../../api/api';
import { cancelOvertime, declareOvertime, getMyBalance, getMyRequests } from '../../api/functions';
import { Balance, OvertimeInput, Requests, RequestStatus } from '../../api/models';
import { BalanceFigures, BalanceHistory } from '../../shared/balance-view';
import { errorMessage, formatShortDate } from '../../shared/dates';
import { openDialog } from '../../shared/dialogs';
import { PageHeader } from '../../shared/page-header';
import { formatHours, STATUS_LABELS } from '../../shared/requests';
import { OvertimeDialog } from './overtime-dialog';

/**
 * /mes-demandes : heures supplémentaires uniquement (spec) — déclaration, mes déclarations, solde et historique.
 * Les absences se posent directement sur le planning (mode Édition).
 */
@Component({
  selector: 'app-my-requests-page',
  imports: [
    BalanceFigures,
    BalanceHistory,
    NgIcon,
    PageHeader,
    RouterLink,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCardImports,
    ZardDropdownImports,
    ZardEmptyComponent,
    ZardItemImports,
    ZardSkeletonComponent,
    ZardTabsImports,
  ],
  viewProviders: [provideIcons({ lucideCalendarX, lucideClock, lucideClockPlus, lucideEllipsis, lucideHourglass })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mx-auto flex max-w-5xl flex-col gap-8' },
  template: `
    <app-page-header title="Mes demandes" description="Déclarez vos heures supplémentaires et suivez votre solde.">
      <a z-button zType="ghost" routerLink="/planning">
        <ng-icon name="lucideCalendarX" /> Poser une absence
      </a>
      <button z-button type="button" (click)="declare()"><ng-icon name="lucideClockPlus" /> Déclarer des heures</button>
    </app-page-header>

    @if (balance(); as b) {
      <app-balance-figures [balance]="b">
        <z-card>
          <z-card-content class="flex flex-col gap-1">
            <span class="text-sm text-muted-foreground">En attente de validation</span>
            <span class="text-3xl font-semibold tracking-tight tabular-nums">{{ pendingCount() }}</span>
            <span class="text-xs text-muted-foreground">{{ pendingCount() > 1 ? 'déclarations' : 'déclaration' }}</span>
          </z-card-content>
        </z-card>
      </app-balance-figures>
    } @else {
      <div class="grid gap-4 sm:grid-cols-3">
        @for (i of [1, 2, 3]; track i) {
          <z-skeleton class="h-[104px] rounded-xl" />
        }
      </div>
    }

    <z-card>
      <z-card-content>
        <z-tab-group>
          <z-tab label="Mes déclarations">
            <div class="pt-4">
              @if (requests(); as r) {
                @if (r.overtimes.length) {
                  <div z-item-group class="gap-0">
                    @for (o of r.overtimes; track o.id; let last = $last) {
                      <div z-item>
                        <div z-item-media zVariant="icon" class="size-9 rounded-lg bg-muted">
                          <ng-icon name="lucideClock" />
                        </div>
                        <div z-item-content>
                          <div z-item-title>{{ o.reason }}</div>
                          <p z-item-description>
                            {{ date(o.date) }}
                            @if (o.adminComment) {
                              · « {{ o.adminComment }} »
                            }
                          </p>
                        </div>
                        <span class="w-16 text-right text-sm font-medium tabular-nums">{{ hours(o.hours) }}</span>
                        <z-badge [zType]="statusBadge[o.status]" class="w-24 justify-center">{{ statusLabels[o.status] }}</z-badge>
                        <div class="w-8">
                          @if (o.status === 'PENDING') {
                            <button z-button zType="ghost" zSize="icon-sm" type="button" aria-label="Actions"
                                    z-dropdown [zDropdownMenu]="menu">
                              <ng-icon name="lucideEllipsis" />
                            </button>
                            <z-dropdown-menu-content #menu="zDropdownMenuContent" zAlign="end" class="w-52">
                              <z-dropdown-menu-item zType="destructive" (click)="cancel(o.id)">
                                Annuler la déclaration
                              </z-dropdown-menu-item>
                            </z-dropdown-menu-content>
                          }
                        </div>
                      </div>
                      @if (!last) {
                        <div z-item-separator class="my-0"></div>
                      }
                    }
                  </div>
                } @else {
                  <z-empty zIcon="lucideHourglass" zTitle="Aucune déclaration"
                           zDescription="Vos heures supplémentaires déclarées apparaîtront ici, avec leur statut.">
                    <button z-button zType="outline" type="button" (click)="declare()">Déclarer des heures</button>
                  </z-empty>
                }
              } @else {
                <div class="flex flex-col gap-3">
                  <z-skeleton class="h-12" /><z-skeleton class="h-12" />
                </div>
              }
            </div>
          </z-tab>
          <z-tab label="Historique du solde">
            <div class="pt-4">
              @if (balance(); as b) {
                <app-balance-history [balance]="b" />
              }
            </div>
          </z-tab>
        </z-tab-group>
      </z-card-content>
    </z-card>
  `,
})
export class MyRequestsPage {
  private readonly api = inject(Api);
  private readonly dialogs = inject(ZardDialogService);
  private readonly toast = inject(ZardSonnerService);

  protected readonly requests = signal<Requests | null>(null);
  protected readonly balance = signal<Balance | null>(null);
  protected readonly pendingCount = computed(
    () => this.requests()?.overtimes.filter((o) => o.status === 'PENDING').length ?? 0,
  );
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusBadge: Record<RequestStatus, 'outline' | 'default' | 'destructive' | 'secondary'> = {
    PENDING: 'outline',
    APPROVED: 'default',
    REJECTED: 'destructive',
    CANCELLED: 'secondary',
  };
  protected readonly hours = (h: number) => formatHours(h);
  protected readonly date = (iso: string) => formatShortDate(iso);

  constructor() {
    void this.reload();
  }

  protected async declare(): Promise<void> {
    const input = await openDialog<OvertimeDialog, void, OvertimeInput>(this.dialogs, OvertimeDialog);
    if (input) await this.run(() => this.api.invoke(declareOvertime, { body: input }), 'Heures déclarées, en attente de validation');
  }

  protected async cancel(id: number): Promise<void> {
    await this.run(() => this.api.invoke(cancelOvertime, { id }), 'Déclaration annulée');
  }

  private async run(call: () => Promise<unknown>, success: string): Promise<void> {
    try {
      await call();
      this.toast.success(success);
    } catch (error) {
      this.toast.error(errorMessage(error), { duration: 8000 });
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const [requests, balance] = await Promise.all([this.api.invoke(getMyRequests), this.api.invoke(getMyBalance)]);
      this.requests.set(requests);
      this.balance.set(balance);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Impossible de charger vos demandes'), { duration: 6000 });
    }
  }
}
