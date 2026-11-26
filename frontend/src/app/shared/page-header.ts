import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** En-tête de page : titre, description, actions projetées à droite. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between' },
  template: `
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ title() }}</h1>
      @if (description()) {
        <p class="text-sm text-muted-foreground">{{ description() }}</p>
      }
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <ng-content />
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
