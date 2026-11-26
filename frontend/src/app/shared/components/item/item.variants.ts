import { cva, type VariantProps } from 'class-variance-authority';

export const itemGroupVariants = cva('flex w-full flex-col gap-4 has-[>[data-slot=item][data-size=sm]]:gap-2.5 has-[>[data-slot=item][data-size=xs]]:gap-2 group/item-group');

export const itemSeparatorVariants = cva('bg-border my-2 block h-px w-full shrink-0');

export const itemVariants = cva('flex w-full flex-wrap items-center rounded-lg border text-sm transition-colors duration-100 focus-visible:border-ring focus-visible:ring-ring/50 [a]:hover:bg-muted focus-visible:ring-3 [a]:transition-colors group/item outline-none', {
  variants: {
    zVariant: {
      default: 'border-transparent',
      outline: 'border-border',
      muted: 'bg-muted/50 border-transparent',
    },
    zSize: {
      default: 'gap-2.5 px-3 py-2.5',
      sm: 'gap-2.5 px-3 py-2.5',
      xs: 'gap-2 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0',
    },
  },
  defaultVariants: {
    zVariant: 'default',
    zSize: 'default',
  },
});

export const itemMediaVariants = cva('flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none', {
  variants: {
    zVariant: {
      default: 'bg-transparent',
      icon: "[--ng-icon__size:1rem] [&_svg:not([class*='size-'])]:size-4",
      image: 'size-10 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover',
    },
  },
  defaultVariants: {
    zVariant: 'default',
  },
});

export const itemContentVariants = cva('flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none');

export const itemTitleVariants = cva('line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4');

export const itemDescriptionVariants = cva('text-muted-foreground line-clamp-2 text-start text-sm leading-normal group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4');

export const itemActionsVariants = cva('flex items-center gap-2');

export const itemHeaderVariants = cva('flex basis-full items-center justify-between gap-2');

export const itemFooterVariants = cva('flex basis-full items-center justify-between gap-2');

export type ZardItemVariantVariants = NonNullable<VariantProps<typeof itemVariants>['zVariant']>;
export type ZardItemSizeVariants = NonNullable<VariantProps<typeof itemVariants>['zSize']>;
export type ZardItemMediaVariantVariants = NonNullable<VariantProps<typeof itemMediaVariants>['zVariant']>;
