import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ZardAvatarComponent } from '@/shared/components/avatar';
import { UserSummary } from '../api/models';
import { colorFor, initials, tint } from './user-color';

/** Avatar à initiales, dans la couleur de la personne sur le planning. */
@Component({
  selector: 'app-user-avatar',
  imports: [ZardAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-avatar [zFallback]="letters()" [zSize]="size()" [zAlt]="''"
              [style.--muted]="background()" [style.--muted-foreground]="color()" class="font-medium" />
  `,
})
export class UserAvatar {
  readonly user = input.required<UserSummary>();
  readonly size = input<'sm' | 'default' | 'lg'>('default');

  protected readonly letters = computed(() => initials(this.user()));
  protected readonly color = computed(() => colorFor(this.user().id));
  protected readonly background = computed(() => tint(this.color(), 0.85));
}
