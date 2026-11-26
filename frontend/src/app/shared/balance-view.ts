import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideHistory } from '@ng-icons/lucide';
import { ZardCardImports } from '@/shared/components/card';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardItemImports } from '@/shared/components/item';
import { Balance } from '../api/models';
import { formatShortDate } from './dates';
import { formatHours } from './requests';

/** Solde et disponible, en cartes chiffrées. Une carte supplémentaire peut être projetée. */
@Component({
  selector: 'app-balance-figures',
  imports: [ZardCardImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4 sm:grid-cols-3' },
  template: `
    <z-card>
      <z-card-content class="flex flex-col gap-1">
        <span class="text-sm text-muted-foreground">Solde d'heures sup</span>
        <span class="text-3xl font-semibold tracking-tight tabular-nums">{{ hours(balance().balance) }}</span>
      </z-card-content>
    </z-card>
    <z-card>
      <z-card-content class="flex flex-col gap-1">
        <span class="text-sm text-muted-foreground">Disponible</span>
        <span class="text-3xl font-semibold tracking-tight tabular-nums">{{ hours(balance().available) }}</span>
        <span class="text-xs text-muted-foreground">Solde moins les récupérations en attente</span>
      </z-card-content>
    </z-card>
    <ng-content />
  `,
})
export class BalanceFigures {
  readonly balance = input.required<Balance>();
  protected readonly hours = formatHours;
}

/** Historique des mouvements du solde (heures sup, récupérations, ajustements). */
@Component({
  selector: 'app-balance-history',
  imports: [ZardEmptyComponent, ZardItemImports],
  viewProviders: [provideIcons({ lucideHistory })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (balance().movements.length) {
      <div z-item-group class="gap-0">
        @for (m of balance().movements; track $index; let last = $last) {
          <div z-item zSize="sm">
            <div z-item-content>
              <div z-item-title>{{ m.label }}</div>
              <p z-item-description>{{ date(m.date) }}</p>
            </div>
            <span class="text-sm font-medium tabular-nums" [class.text-destructive]="m.hours < 0"
                  [class.text-success]="m.hours > 0">{{ hours(m.hours, true) }}</span>
          </div>
          @if (!last) {
            <div z-item-separator class="my-0"></div>
          }
        }
      </div>
    } @else {
      <z-empty zIcon="lucideHistory" zTitle="Aucun mouvement"
               zDescription="Les heures sup validées, récupérations et ajustements apparaîtront ici." />
    }
  `,
})
export class BalanceHistory {
  readonly balance = input.required<Balance>();
  protected readonly hours = formatHours;
  protected readonly date = (iso: string) => formatShortDate(iso);
}
