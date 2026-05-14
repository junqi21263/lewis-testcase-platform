import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

/**
 * 变体：default 主按钮、secondary 次要、destructive 危险、link 文本按钮；
 * outline / ghost 保留以兼容全站既有用法。
 * 状态：default / hover / focus-visible / active / disabled / aria-busy（loading，由调用方设 aria-busy）
 */
const buttonVariants = cva(
    [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[length:var(--text-button-size)] font-semibold',
    'ring-offset-background transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50 disabled:grayscale-[0.2]',
    'aria-busy:cursor-wait aria-busy:opacity-90',
    'active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 focus-visible:ring-primary/35 active:bg-primary/80',
        destructive:
          'bg-destructive text-destructive-foreground shadow-md shadow-destructive/15 hover:bg-destructive/90 hover:shadow-lg focus-visible:ring-destructive/35 active:bg-destructive/80',
        outline:
          'border-0 bg-background/60 text-foreground shadow-sm ring-1 ring-inset ring-border/90 backdrop-blur-md hover:bg-accent hover:text-accent-foreground hover:ring-border focus-visible:ring-ring/60 active:bg-accent/80 dark:bg-background/45 dark:ring-white/12 dark:hover:ring-white/18',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm ring-1 ring-inset ring-transparent hover:bg-secondary/85 hover:shadow focus-visible:ring-secondary-foreground/15 active:bg-secondary/70',
        ghost:
          'text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 active:bg-accent/75',
        link: 'h-auto rounded-md p-0 text-primary underline-offset-4 shadow-none hover:underline focus-visible:ring-ring/40 active:text-primary/80 active:scale-100',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-[length:var(--text-small-size)]',
        lg: 'h-11 rounded-xl px-8',
        icon: 'h-10 w-10',
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
