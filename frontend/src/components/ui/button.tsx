import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium outline-none transition-[transform,background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_10px_28px_-18px_rgba(0,122,255,0.85)] hover:bg-primary/90 hover:shadow-[0_14px_34px_-22px_rgba(0,122,255,0.95)]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_12px_30px_-20px_rgba(255,59,48,0.75)] hover:bg-destructive/90',
        outline:
          'bg-[color:var(--glass-bg)] text-foreground shadow-sm ring-1 ring-inset ring-[color:var(--glass-border)] backdrop-blur-[var(--glass-blur)] hover:bg-[color:color-mix(in_srgb,var(--glass-bg),white_6%)] dark:hover:bg-[color:color-mix(in_srgb,var(--glass-bg),white_8%)]',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/85 dark:hover:bg-secondary/80',
        ghost:
          'bg-transparent text-foreground hover:bg-[color:var(--glass-bg)] hover:backdrop-blur-[var(--glass-blur)]',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-10 px-4',
        lg: 'h-12 px-7 text-[15px]',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
