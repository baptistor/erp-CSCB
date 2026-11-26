import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideCircleX, lucideTriangleAlert } from '@ng-icons/lucide';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardComboboxImports } from '@/shared/components/combobox';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardInputGroupImports } from '@/shared/components/input-group';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardSwitchComponent } from '@/shared/components/switch';
import { ZardToggleGroupComponent, ZardToggleGroupItem } from '@/shared/components/toggle-group';
import { map, startWith } from 'rxjs';
import { Api } from '../../../api/api';
import { getUsers, getUserSchedule, updateUserSchedule } from '../../../api/functions';
import { TypicalDay, UserSchedule, UserSummary } from '../../../api/models';
import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../shared/dates';
import {
  BREAK,
  contractStatus,
  DAY_LABELS,
  formatMinutes,
  isValidWeeklyHours,
  quarterSlots,
  rangeError,
  toMinutes,
} from '../../../shared/schedule-rules';
import { fullName, setUserColors } from '../../../shared/user-color';
import { UserAvatar } from '../../../shared/user-avatar';

type DayGroup = FormGroup<{
  morning: FormControl<boolean>;
  morningStart: FormControl<string>;
  morningEnd: FormControl<string>;
  afternoon: FormControl<boolean>;
  afternoonStart: FormControl<string>;
  afternoonEnd: FormControl<string>;
}>;

export interface DayValue {
  morning: boolean;
  morningStart: string;
  morningEnd: string;
  afternoon: boolean;
  afternoonStart: string;
  afternoonEnd: string;
}

type Week = 'classic' | 'holiday';

/** Erreur d'un jour (spec §1) : fin > début, matin fini à 12:30 au plus tard, après-midi à partir de 13:30. */
export function dayError(day: DayValue): string | null {
  if (day.morning) {
    const error = rangeError(day.morningStart, day.morningEnd);
    if (error) return `Matin : ${error}`;
    if (day.morningEnd > BREAK.start) return 'Le matin doit finir au plus tard à 12:30 (pause de midi)';
  }
  if (day.afternoon) {
    const error = rangeError(day.afternoonStart, day.afternoonEnd);
    if (error) return `Après-midi : ${error}`;
    if (day.afternoonStart < BREAK.end) return "L'après-midi doit commencer au plus tôt à 13:30 (pause de midi)";
  }
  return null;
}

/** Durée d'un jour de la semaine type, en minutes, hors pause (0 si non travaillé ou invalide). */
export function dayMinutes(day: DayValue): number {
  if (dayError(day)) return 0;
  return (
    (day.morning ? toMinutes(day.morningEnd) - toMinutes(day.morningStart) : 0) +
    (day.afternoon ? toMinutes(day.afternoonEnd) - toMinutes(day.afternoonStart) : 0)
  );
}

/** Semaine valide : chaque jour valide, et total exactement égal au contrat. */
export function weekOk(days: DayValue[], weeklyHours: number | null): boolean {
  if (!isValidWeeklyHours(weeklyHours) || days.some((d) => dayError(d))) return false;
  return contractStatus(days.reduce((sum, d) => sum + dayMinutes(d), 0), weeklyHours!).kind === 'ok';
}

/**
 * Semaines type (classique et vacances scolaires) + contrat hebdomadaire commun (spec §1). Admin : choix de l'employé,
 * contrat modifiable. [selfOnly] (employé) : ses propres horaires, contrat en lecture seule. Indicateur permanent
 * vert / rouge / orange.
 */
@Component({
  selector: 'app-typical-week-form',
  imports: [
    NgIcon,
    ReactiveFormsModule,
    UserAvatar,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCardImports,
    ZardComboboxImports,
    ZardFieldImports,
    ZardInputComponent,
    ZardInputGroupImports,
    ZardSelectImports,
    ZardSkeletonComponent,
    ZardSwitchComponent,
    ZardToggleGroupComponent,
  ],
  viewProviders: [provideIcons({ lucideCircleCheck, lucideCircleX, lucideTriangleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    @if (!selfOnly()) {
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium">Employé</span>
        <z-combobox zWidth="md" [zValue]="userKey()" (zValueChange)="pick($event)">
          <z-combobox-input placeholder="Rechercher un employé" />
          <z-combobox-content>
            <z-combobox-empty>Aucun employé trouvé.</z-combobox-empty>
            <z-combobox-list>
              @for (user of users(); track user.id) {
                <z-combobox-item [zValue]="'' + user.id" [zLabel]="name(user)">
                  <span class="flex items-center gap-2"><app-user-avatar [user]="user" size="sm" /> {{ name(user) }}</span>
                </z-combobox-item>
              }
            </z-combobox-list>
          </z-combobox-content>
        </z-combobox>
      </div>
    }

    <ng-template #holidayLabel>
      Vacances scolaires
      @if (!holidayFilled()) {
        <z-badge class="todo">À compléter</z-badge>
      }
    </ng-template>

    @if (userId() != null && loaded()) {
      <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="save()">
        <z-card>
          <z-card-header class="border-b">
            <z-card-title>Semaine type</z-card-title>
            <z-card-description>
              Horaires habituels, matin jusqu'à 12:30 et après-midi dès 13:30 : la pause de midi n'est pas comptée.
            </z-card-description>
          </z-card-header>
          <z-card-content class="flex flex-col gap-6">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <z-field class="w-56">
                <label z-field-label for="weekly-hours">Contrat hebdomadaire</label>
                <z-input-group>
                  <input z-input id="weekly-hours" type="number" step="0.25" min="0.25" max="168"
                         formControlName="weeklyHours" [attr.aria-invalid]="!weeklyValid() || null" />
                  <z-input-group-addon zAlign="inline-end"><span z-input-group-text>h / semaine</span></z-input-group-addon>
                </z-input-group>
                @if (!weeklyValid()) {
                  <z-field-error>Entre 0,25 et 168 h, par pas de 0,25 h</z-field-error>
                } @else if (selfOnly()) {
                  <p z-field-description>Modifiable uniquement par un admin</p>
                }
              </z-field>
              <z-toggle-group class="flex-wrap" zMode="single" zType="outline" [zDeselectable]="false" [zItems]="weekItems()"
                              [zValue]="week()" (valueChange)="show($any($event))" aria-label="Type de semaine" />
            </div>
            @if (week() === 'holiday' && !holidayFilled()) {
              <p class="text-sm text-muted-foreground">
                Semaine de vacances pas encore renseignée : elle reprend la semaine classique. Adaptez-la puis enregistrez.
              </p>
            }

            <div class="flex flex-col divide-y">
              @for (day of form.controls[week()].controls; track day; let i = $index) {
                <div class="day" [formGroup]="day">
                  <span class="text-sm font-medium">{{ labels[i] }}</span>
                  <div class="slot">
                    <span class="w-32 shrink-0 whitespace-nowrap"><z-switch formControlName="morning">Matin</z-switch></span>
                    @if (day.controls.morning.value) {
                      <z-select zSize="sm" class="w-24" formControlName="morningStart" [zAriaLabel]="labels[i] + ' matin début'">
                        @for (t of slots('06:00', '12:30', day.controls.morningStart.value); track t) {
                          <z-select-item [zValue]="t">{{ t }}</z-select-item>
                        }
                      </z-select>
                      <span class="text-muted-foreground">–</span>
                      <z-select zSize="sm" class="w-24" formControlName="morningEnd" [zAriaLabel]="labels[i] + ' matin fin'">
                        @for (t of slots('06:00', '12:30', day.controls.morningEnd.value); track t) {
                          <z-select-item [zValue]="t">{{ t }}</z-select-item>
                        }
                      </z-select>
                    } @else {
                      <span class="text-sm text-muted-foreground">Non travaillé</span>
                    }
                  </div>
                  <div class="slot">
                    <span class="w-32 shrink-0 whitespace-nowrap"><z-switch formControlName="afternoon">Après-midi</z-switch></span>
                    @if (day.controls.afternoon.value) {
                      <z-select zSize="sm" class="w-24" formControlName="afternoonStart" [zAriaLabel]="labels[i] + ' après-midi début'">
                        @for (t of slots('13:30', '22:00', day.controls.afternoonStart.value); track t) {
                          <z-select-item [zValue]="t">{{ t }}</z-select-item>
                        }
                      </z-select>
                      <span class="text-muted-foreground">–</span>
                      <z-select zSize="sm" class="w-24" formControlName="afternoonEnd" [zAriaLabel]="labels[i] + ' après-midi fin'">
                        @for (t of slots('13:30', '22:00', day.controls.afternoonEnd.value); track t) {
                          <z-select-item [zValue]="t">{{ t }}</z-select-item>
                        }
                      </z-select>
                    } @else {
                      <span class="text-sm text-muted-foreground">Non travaillé</span>
                    }
                  </div>
                  <span class="text-right text-sm tabular-nums" [class.text-muted-foreground]="!durations()[i]">
                    {{ durations()[i] ? duration(durations()[i]) : '—' }}
                  </span>
                  @if (dayErrors()[i]; as error) {
                    <p class="col-span-full text-xs text-destructive">{{ error }}</p>
                  }
                </div>
              }
            </div>
          </z-card-content>
        </z-card>

        <!-- barre collante : indicateur du contrat (vert / rouge / orange) + enregistrement -->
        <div class="savebar" [attr.data-kind]="status()?.kind ?? 'under'" role="status" aria-live="polite">
          @if (status(); as st) {
            <ng-icon class="shrink-0" [name]="st.kind === 'ok' ? 'lucideCircleCheck' : st.kind === 'under' ? 'lucideCircleX' : 'lucideTriangleAlert'" />
            <span class="flex-1 text-sm font-medium">{{ st.message }}</span>
          } @else {
            <span class="flex-1 text-sm">Total : {{ duration(total()) }}</span>
          }
          @if (blocked(); as reason) {
            <span class="hidden text-xs text-muted-foreground lg:inline">{{ reason }}</span>
          }
          <button z-button type="submit" [disabled]="!canSave() || saving()" [zLoading]="saving()">Enregistrer</button>
        </div>
      </form>
    } @else {
      <z-skeleton class="h-[560px] rounded-xl" />
    }
  `,
  styles: `
    .day { display: grid; align-items: center; gap: 12px 24px; padding: 12px 0;
      grid-template-columns: 7rem 1fr 1fr 4rem; }
    @media (max-width: 900px) { .day { grid-template-columns: 1fr auto; } .day .slot { grid-column: 1 / -1; } }
    .slot { display: flex; align-items: center; gap: 8px; min-height: 32px; }
    .todo { margin-left: 6px; background: color-mix(in oklab, var(--warning) 15%, transparent); color: var(--warning); }
    /* vert = contrat respecté, rouge = il manque des heures, orange = heures en trop */
    .savebar { --kind: var(--success); position: sticky; bottom: 16px; z-index: 10; display: flex; align-items: center; gap: 12px;
      padding: 10px 12px 10px 16px; border-radius: var(--radius); background: color-mix(in oklab, var(--kind) 8%, var(--background));
      border: 1px solid color-mix(in oklab, var(--kind) 40%, transparent); color: var(--kind);
      box-shadow: 0 4px 12px -2px rgb(0 0 0 / 0.08); }
    .savebar[data-kind='under'] { --kind: var(--destructive); }
    .savebar[data-kind='over'] { --kind: var(--warning); }
  `,
})
export class TypicalWeekForm implements OnInit {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ZardSonnerService);
  private readonly auth = inject(AuthService);

  /** Mode employé : ses propres horaires uniquement. */
  readonly selfOnly = input(false);
  /** Employé choisi (mode admin), pour afficher ses heures ajoutées à venir à côté. */
  readonly userChange = output<number>();

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly userId = signal<number | null>(null);
  protected readonly userKey = computed(() => (this.userId() == null ? '' : String(this.userId())));
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly labels = DAY_LABELS;
  protected readonly name = fullName;

  protected readonly week = signal<Week>('classic');
  private readonly holidayLabel = viewChild.required<TemplateRef<void>>('holidayLabel');
  protected readonly weekItems = computed<ZardToggleGroupItem[]>(() => [
    { value: 'classic', label: 'Semaine classique' },
    { value: 'holiday', template: this.holidayLabel() },
  ]);
  /** La semaine de vacances a déjà été enregistrée (sinon elle reprend la classique). */
  protected readonly holidayFilled = signal(false);

  protected readonly form = this.fb.group({
    weeklyHours: this.fb.control<number | null>(35),
    classic: this.fb.array(DAY_LABELS.map(() => this.dayGroup())),
    holiday: this.fb.array(DAY_LABELS.map(() => this.dayGroup())),
  });

  /** Valeurs du formulaire en continu (pour l'indicateur et les durées, recalculés à chaque frappe). */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly weeklyValid = computed(() => isValidWeeklyHours(this.value().weeklyHours));
  private readonly shownDays = computed(() => this.value()[this.week()]);
  protected readonly durations = computed(() => this.shownDays().map((day) => dayMinutes(day)));
  protected readonly dayErrors = computed(() => this.shownDays().map((day) => dayError(day)));
  protected readonly total = computed(() => this.durations().reduce((sum, m) => sum + m, 0));
  protected readonly status = computed(() =>
    this.weeklyValid() ? contractStatus(this.total(), this.value().weeklyHours!) : null,
  );

  /** La semaine de vacances est envoyée si elle existe déjà, ou si l'on est en train de la remplir. */
  private readonly sendHoliday = computed(() => {
    this.value();
    return this.holidayFilled() || this.week() === 'holiday' || this.form.controls.holiday.dirty;
  });

  /** Raison qui empêche l'enregistrement (les deux semaines partagent le contrat), ou null. */
  protected readonly blocked = computed(() => {
    const { weeklyHours, classic, holiday } = this.value();
    if (!weekOk(classic, weeklyHours)) return 'La semaine classique doit respecter le contrat pour enregistrer.';
    if (this.sendHoliday() && !weekOk(holiday, weeklyHours)) {
      return 'La semaine de vacances doit respecter le contrat pour enregistrer.';
    }
    return null;
  });
  protected readonly canSave = computed(() => this.blocked() === null);
  protected readonly duration = formatMinutes;
  protected readonly slots = quarterSlots;

  ngOnInit(): void {
    const me = this.auth.currentUser();
    if (this.selfOnly()) {
      this.form.controls.weeklyHours.disable();
      if (me) void this.select(me.id);
      return;
    }
    void this.api.invoke(getUsers).then((users) => {
      setUserColors(users.map((u) => u.id));
      this.users.set(users);
      if (users.length) void this.select(users[0].id);
    });
  }

  protected pick(value: string | string[] | null): void {
    if (typeof value === 'string' && value && +value !== this.userId()) void this.select(+value);
  }

  protected async select(userId: number): Promise<void> {
    this.userId.set(userId);
    this.userChange.emit(userId);
    this.loaded.set(false);
    this.week.set('classic');
    try {
      this.fill(await this.api.invoke(getUserSchedule, { userId }));
      this.loaded.set(true);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Impossible de charger les horaires'), { duration: 5000 });
    }
  }

  /** Semaine de vacances jamais remplie : on part de la semaine classique. */
  protected show(week: Week): void {
    if (week === 'holiday' && !this.holidayFilled() && !this.form.controls.holiday.dirty) {
      this.form.controls.holiday.setValue(this.form.controls.classic.getRawValue());
    }
    this.week.set(week);
  }

  protected async save(): Promise<void> {
    const userId = this.userId();
    if (userId == null || !this.canSave()) return;
    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      const saved = await this.api.invoke(updateUserSchedule, {
        userId,
        body: {
          weeklyHours: value.weeklyHours!,
          days: this.toDays(value.classic),
          holidayDays: this.sendHoliday() ? this.toDays(value.holiday) : null,
        },
      });
      this.fill(saved);
      this.toast.success('Horaires enregistrés', { duration: 3000 });
    } catch (error) {
      this.toast.error(errorMessage(error), { duration: 8000 });
    } finally {
      this.saving.set(false);
    }
  }

  private toDays(days: DayValue[]): TypicalDay[] {
    return days.map((day, i) => ({
      dayOfWeek: i + 1,
      morningStart: day.morning ? day.morningStart : null,
      morningEnd: day.morning ? day.morningEnd : null,
      afternoonStart: day.afternoon ? day.afternoonStart : null,
      afternoonEnd: day.afternoon ? day.afternoonEnd : null,
    }));
  }

  private fill(schedule: UserSchedule): void {
    this.form.markAsPristine();
    this.form.controls.weeklyHours.setValue(schedule.weeklyHours);
    this.fillWeek('classic', schedule.days);
    this.fillWeek('holiday', schedule.holidayDays ?? schedule.days);
    this.holidayFilled.set(schedule.holidayDays != null);
  }

  private fillWeek(week: Week, days: TypicalDay[]): void {
    days.forEach((day) => {
      this.form.controls[week].at(day.dayOfWeek - 1).setValue({
        morning: day.morningStart != null,
        morningStart: day.morningStart ?? '09:00',
        morningEnd: day.morningEnd ?? '12:30',
        afternoon: day.afternoonStart != null,
        afternoonStart: day.afternoonStart ?? '13:30',
        afternoonEnd: day.afternoonEnd ?? '17:00',
      });
    });
  }

  private dayGroup(): DayGroup {
    return this.fb.group({
      morning: [false],
      morningStart: ['09:00'],
      morningEnd: ['12:30'],
      afternoon: [false],
      afternoonStart: ['13:30'],
      afternoonEnd: ['17:00'],
    });
  }
}
