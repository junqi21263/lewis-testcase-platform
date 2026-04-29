import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border-0 px-2.5 py-1 text-xs font-semibold tracking-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/85',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/85',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/85',
        outline:
          'text-foreground ring-1 ring-inset ring-[color:var(--glass-border)] bg-[color:var(--glass-bg)] backdrop-blur-[var(--glass-blur)]',
        success:
          'border-transparent bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))] ring-1 ring-inset ring-[hsl(var(--success)/0.22)]',
        warning:
          'border-transparent bg-[rgba(255,214,10,0.14)] text-[rgb(255,214,10)] ring-1 ring-inset ring-[rgba(255,214,10,0.22)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
