import { cva } from 'class-variance-authority';

export const textareaVariants = cva('border-input flex field-sizing-content min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 focus-visible:ring-3 aria-invalid:ring-3 md:text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50');

export const inputGroupTextAreaVariants = cva('flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent');
