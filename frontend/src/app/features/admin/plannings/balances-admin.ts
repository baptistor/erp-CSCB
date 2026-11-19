import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../../../api/api';
import { adjustBalance, getUserBalance, getUsers } from '../../../api/functions';
import { Balance, UserSummary } from '../../../api/models';
import { BalanceView } from '../../../shared/balance-view';
import { errorMessage } from '../../../shared/dates';
import { quarterHoursValidator } from '../../../shared/requests';
import { fullName } from '../../../shared/user-color';

/** Onglet « Soldes » : solde d'un employé + ajustement (+/− heures, motif). */
@Component({
  selector: 'app-balances-admin',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, BalanceView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="user">
      <mat-label>Employé</mat-label>
      <mat-select [value]="userId()" (valueChange)="select($event)">
        @for (user of users(); track user.id) {
          <mat-option [value]="user.id">{{ name(user) }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    @if (balance(); as b) {
      <form class="adjust" [formGroup]="form" (ngSubmit)="adjust()">
        <h3>Ajuster le solde</h3>
        <div class="row">
          <mat-form-field appearance="outline" class="hours">
            <mat-label>Heures (+ ou −)</mat-label>
            <input matInput type="number" step="0.25" formControlName="hours" />
            <span matTextSuffix>h</span>
            @if (form.controls.hours.hasError('quarterHours')) {
              <mat-error>Non nul, par pas de 0,25 h</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="reason">
            <mat-label>Motif</mat-label>
            <input matInput formControlName="reason" placeholder="ex. reprise du solde existant" />
          </mat-form-field>
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">Enregistrer</button>
        </div>
      </form>
      <app-balance-view [balance]="b" />
    }
  `,
  styles: `
    :host { display: block; padding-top: 16px; }
    .user { width: 320px; max-width: 100%; }
    .adjust { margin-bottom: 16px; }
    h3 { font: var(--mat-sys-title-medium); margin: 0 0 8px; }
    .row { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
    .hours { width: 160px; }
    .reason { flex: 1; min-width: 240px; max-width: 420px; }
  `,
})
export class BalancesAdmin {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly snack = inject(MatSnackBar);

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly userId = signal<number | null>(null);
  protected readonly balance = signal<Balance | null>(null);
  protected readonly saving = signal(false);
  protected readonly name = fullName;

  protected readonly form = this.fb.group({
    hours: this.fb.control<number | null>(null, [Validators.required, quarterHoursValidator(999, true)]),
    reason: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  constructor() {
    void this.api.invoke(getUsers).then((users) => {
      this.users.set(users);
      if (users.length) void this.select(users[0].id);
    });
  }

  protected async select(userId: number): Promise<void> {
    this.userId.set(userId);
    this.balance.set(null);
    try {
      this.balance.set(await this.api.invoke(getUserBalance, { userId }));
    } catch (error) {
      this.snack.open(errorMessage(error, 'Impossible de charger le solde'), 'OK', { duration: 5000 });
    }
  }

  protected async adjust(): Promise<void> {
    const userId = this.userId();
    if (userId == null || this.form.invalid) return;
    const { hours, reason } = this.form.getRawValue();
    this.saving.set(true);
    try {
      this.balance.set(await this.api.invoke(adjustBalance, { userId, body: { hours: hours!, reason: reason.trim() } }));
      this.form.reset();
      this.snack.open('Solde ajusté', 'OK', { duration: 3000 });
    } catch (error) {
      this.snack.open(errorMessage(error), 'OK', { duration: 8000 });
    } finally {
      this.saving.set(false);
    }
  }
}
