import { cva, type VariantProps } from 'class-variance-authority';

export const sidebarWrapperVariants = cva('flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar group/sidebar-wrapper');

/** `collapsible="none"` — a plain, always-visible column. */
export const sidebarNoneVariants = cva('bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col');

/** The desktop wrapper. Carries `group` and `peer`, so it has to sit on the host element. */
export const sidebarRootVariants = cva('text-sidebar-foreground hidden md:block group peer');

export const sidebarGapVariants = cva('relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0 group-data-[side=right]:rotate-180', {
  variants: {
    zVariant: {
      sidebar: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
      floating: 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]',
      inset: 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]',
    },
  },
  defaultVariants: {
    zVariant: 'sidebar',
  },
});

export const sidebarContainerVariants = cva('fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex', {
  variants: {
    zSide: {
      left: 'left-0 group-data-[collapsible=offcanvas]:-left-(--sidebar-width)',
      right: 'right-0 group-data-[collapsible=offcanvas]:-right-(--sidebar-width)',
    },
    zVariant: {
      sidebar: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
      floating: 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]',
      inset: 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]',
    },
  },
  defaultVariants: {
    zSide: 'left',
    zVariant: 'sidebar',
  },
});

export const sidebarInnerVariants = cva('bg-sidebar flex size-full flex-col group-data-[variant=floating]:ring-sidebar-border group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1');

/**
 * Mobile drawer — replaces shadcn's `Sheet`, which is imperative in Zard. Both parts stay mounted
 * and animate off `data-state`, so the drawer slides out as well as in; `inert` keeps the closed
 * drawer out of the tab order and the accessibility tree.
 */
export const sidebarMobileBackdropVariants = cva('fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 ease-in-out data-closed:pointer-events-none data-closed:opacity-0 data-open:opacity-100');

export const sidebarMobileVariants = cva('bg-sidebar text-sidebar-foreground fixed inset-y-0 z-50 flex h-full w-(--sidebar-width) flex-col p-0 shadow-lg transition-transform ease-in-out data-closed:duration-300 data-open:duration-500', {
  variants: {
    zSide: {
      left: 'left-0 data-closed:-translate-x-full',
      right: 'right-0 data-closed:translate-x-full',
    },
  },
  defaultVariants: {
    zSide: 'left',
  },
});

/**
 * `buttonVariants` already carries `[&_svg:not([class*='size-'])]:size-4`, but @ng-icons styles the
 * svg it renders with higher specificity, so the icon fell back to the 14px font size — 2px short of
 * shadcn. Targeting `ng-icon` with `!` is the same escape hatch the menu button needs.
 */
export const sidebarTriggerVariants = cva("size-7 [&_ng-icon:not([class*='size-'])]:size-4!");

export const sidebarRailVariants = cva('absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear hover:after:bg-sidebar-border hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] group-data-[collapsible=offcanvas]:after:left-full in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize sm:flex [[data-side=left][data-collapsible=offcanvas]_&]:-right-2 [[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-collapsible=offcanvas]_&]:-left-2 [[data-side=right][data-state=collapsed]_&]:cursor-w-resize');

export const sidebarInsetVariants = cva('bg-background relative flex w-full flex-1 flex-col md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2');

export const sidebarInputVariants = cva('bg-background h-8 w-full shadow-none');

export const sidebarHeaderVariants = cva('flex flex-col gap-2 p-2');

export const sidebarFooterVariants = cva('flex flex-col gap-2 p-2');

export const sidebarSeparatorVariants = cva('bg-sidebar-border mx-2 w-auto');

export const sidebarContentVariants = cva('no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden');

export const sidebarGroupVariants = cva('relative flex w-full min-w-0 flex-col p-2');

export const sidebarGroupLabelVariants = cva("text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&_ng-icon:not([class*='size-'])]:size-4! [&_svg]:size-4 [&>ng-icon]:shrink-0 outline-hidden [&_svg]:shrink-0");

export const sidebarGroupActionVariants = cva(
  // Increases the hit area of the button on mobile.
  "text-sidebar-foreground ring-sidebar-ring absolute end-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 focus-visible:ring-2 md:after:hidden [&_ng-icon:not([class*='size-'])]:size-4! [&_svg]:size-4 [&>ng-icon]:shrink-0 outline-hidden [&_svg]:shrink-0",
);

export const sidebarGroupContentVariants = cva('w-full text-sm');

export const sidebarMenuVariants = cva('flex w-full min-w-0 flex-col gap-0');

export const sidebarMenuItemVariants = cva('relative group/menu-item');

export const sidebarMenuButtonVariants = cva(
  "ring-sidebar-ring flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start text-sm transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-has-data-[sidebar=menu-action]/menu-item:pe-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-2 data-[active=true]:font-medium [&_ng-icon:not([class*='size-'])]:size-4! [&_svg]:size-4 [&>ng-icon]:shrink-0 [&>span:last-child]:truncate peer/menu-button outline-hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      zType: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline: 'bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]',
      },
      zSize: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
      },
    },
    defaultVariants: {
      zType: 'default',
      zSize: 'default',
    },
  },
);

export const sidebarMenuActionVariants = cva(
  // Increases the hit area of the button on mobile.
  "text-sidebar-foreground ring-sidebar-ring absolute end-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 focus-visible:ring-2 md:after:hidden [&_ng-icon:not([class*='size-'])]:size-4! [&_svg]:size-4 [&>ng-icon]:shrink-0 outline-hidden [&_svg]:shrink-0",
  {
    variants: {
      zShowOnHover: {
        true: 'peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0',
        false: '',
      },
    },
    defaultVariants: {
      zShowOnHover: false,
    },
  },
);

export const sidebarMenuBadgeVariants = cva('text-sidebar-foreground pointer-events-none absolute end-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 select-none');

export const sidebarMenuSkeletonVariants = cva('flex h-8 items-center gap-2 rounded-md px-2');

export const sidebarMenuSubVariants = cva('border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s px-2.5 py-0.5 group-data-[collapsible=icon]:hidden rtl:-translate-x-px');

export const sidebarMenuSubItemVariants = cva('relative group/menu-sub-item');

export const sidebarMenuSubButtonVariants = cva(
  "text-sidebar-foreground ring-sidebar-ring flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&_svg]:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden focus-visible:ring-2 rtl:translate-x-px [&_ng-icon:not([class*='size-'])]:size-4! [&_svg]:size-4 [&>ng-icon]:shrink-0 [&>span:last-child]:truncate outline-hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      zSize: {
        sm: 'text-xs',
        md: 'text-sm',
      },
    },
    defaultVariants: {
      zSize: 'md',
    },
  },
);

export type ZardSidebarSideVariants = NonNullable<VariantProps<typeof sidebarContainerVariants>['zSide']>;
export type ZardSidebarVariantVariants = NonNullable<VariantProps<typeof sidebarContainerVariants>['zVariant']>;
export type ZardSidebarCollapsibleVariants = 'offcanvas' | 'icon' | 'none';
export type ZardSidebarMenuButtonTypeVariants = NonNullable<VariantProps<typeof sidebarMenuButtonVariants>['zType']>;
export type ZardSidebarMenuButtonSizeVariants = NonNullable<VariantProps<typeof sidebarMenuButtonVariants>['zSize']>;
export type ZardSidebarMenuSubButtonSizeVariants = NonNullable<
  VariantProps<typeof sidebarMenuSubButtonVariants>['zSize']
>;
