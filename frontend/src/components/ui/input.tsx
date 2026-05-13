import * as React from 'react'
import { cn } from '@/utils/cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * 状态：default / hover / focus-visible / active / disabled（无 loading：由父级控制）
 * 圆角与层次对齐 GLOBAL_DESIGN_SYSTEM（BORDER_RADIUS 8px ≈ rounded-lg）
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border-0 bg-background/60 px-3 py-2 text-sm text-foreground shadow-sm',
        'ring-1 ring-inset ring-border/90 backdrop-blur-md transition-all duration-200 ease-out',
        'placeholder:text-muted-foreground',
        'hover:bg-background/75 hover:ring-border',
        'focus-visible:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
        'active:scale-[0.998] active:ring-ring/80 motion-reduce:active:scale-100',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background/60 disabled:hover:ring-border/90',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'dark:bg-background/40 dark:ring-white/12 dark:hover:ring-white/18',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
