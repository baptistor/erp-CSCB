import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSlidersHorizontal } from '@ng-icons/lucide';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogService } from '@/shared/components/dialog';
import { ZardItemImports } from '@/shared/components/item';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api } from '../../../api/api';
import { adjustBalance, getUserBalance, getUsers } from '../../../api/functions';
import { AdjustmentInput, Balance, UserSummary } from '../../../api/models';
import { BalanceFigures, BalanceHistory } from '../../../shared/balance-view';
import { errorMessage } from '../../../shared/dates';
import { openDialog } from '../../../shared/dialogs';
import { fullName, setUserColors } from '../../../shared/user-color';
import { UserAvatar } from '../../../shared/user-avatar';
import { AdjustBalanceDialog, AdjustBalanceDialogData } from './adjust-balance-dialog';

/** Onglet « Soldes » : liste des employés à gauche, solde + historique + ajustement à droite. */
@Component({
  selector: 'app-balances-admin',
  imports: [
    BalanceFigures,
    BalanceHistory,
    NgIcon,
    UserAvatar,
    ZardButtonComponent,
    ZardCardImports,
    ZardItemImports,
    ZardSkeletonComponent,
  ],
  viewProviders: [provideIcons({ lucideSlidersHorizontal })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid items-start gap-6 lg:grid-cols-[260px_1fr]' },
  template: `
    <z-card zSize="sm" class="lg:sticky lg:top-0">
      <z-card-content class="flex max-h-72 flex-col gap-0.5 overflow-y-auto lg:max-h-[70vh]" role="listbox"
                      aria-label="Employés">
        @for (user of users(); track user.id) {
          <button z-item zSize="xs" type="button" role="option" class="text-left hover:bg-muted"
                  [class.bg-muted]="user.id === userId()" [attr.aria-selected]="user.id === userId()"
                  (click)="select(user.id)">
            <div z-item-media><app-user-avatar [user]="user" size="sm" /></div>
            <div z-item-content><div z-item-title>{{ name(user) }}</div></div>
          </button>
        }
      </z-card-content>
    </z-card>

    <div class="flex min-w-0 flex-col gap-6">
      @if (selected(); as user) {
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <app-user-avatar [user]="user" size="lg" />
            <div>
              <p class="text-base font-semibold">{{ name(user) }}</p>
              <p class="text-sm text-muted-foreground">{{ user.email }}</p>
            </div>
          </div>
          <button z-button zType="outline" type="button" [disabled]="!balance()" (click)="adjust(user)">
            <ng-icon name="lucideSlidersHorizontal" /> Ajuster le solde
          </button>
        </div>
      }

      @if (balance(); as b) {
        <app-balance-figures [balance]="b" class="sm:grid-cols-2!" />
        <z-card>
          <z-card-header>
            <z-card-title>Historique</z-card-title>
            <z-card-description>Heures sup validées, récupérations et ajustements.</z-card-description>
          </z-card-header>
          <z-card-content><app-balance-history [balance]="b" /></z-card-content>
        </z-card>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2">
          <z-skeleton class="h-[104px] rounded-xl" /><z-skeleton class="h-[104px] rounded-xl" />
        </div>
        <z-skeleton class="h-48 rounded-xl" />
      }
    </div>
  `,
})
export class BalancesAdmin {
  private readonly api = inject(Api);
  private readonly dialogs = inject(ZardDialogService);
  private readonly toast = inject(ZardSonnerService);

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly userId = signal<number | null>(null);
  protected readonly selected = computed(() => this.users().find((u) => u.id === this.userId()) ?? null);
  protected readonly balance = signal<Balance | null>(null);
  protected readonly name = fullName;

  constructor() {
    void this.api.invoke(getUsers).then((users) => {
      setUserColors(users.map((u) => u.id));
      this.users.set(users);
      if (users.length) void this.select(users[0].id);
    });
  }

  protected async select(userId: number): Promise<void> {
    if (userId === this.userId()) return;
    this.userId.set(userId);
    this.balance.set(null);
    try {
      const balance = await this.api.invoke(getUserBalance, { userId });
      if (this.userId() === userId) this.balance.set(balance);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Impossible de charger le solde'), { duration: 5000 });
    }
  }

  protected async adjust(user: UserSummary): Promise<void> {
    const body = await openDialog<AdjustBalanceDialog, AdjustBalanceDialogData, AdjustmentInput>(
      this.dialogs,
      AdjustBalanceDialog,
      { name: fullName(user) },
    );
    if (!body) return;
    try {
      this.balance.set(await this.api.invoke(adjustBalance, { userId: user.id, body }));
      this.toast.success('Solde ajusté', { duration: 3000 });
    } catch (error) {
      this.toast.error(errorMessage(error), { duration: 8000 });
    }
  }
}
