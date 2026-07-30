import { ChevronDown, Loader2 } from 'lucide-react'
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/simplicity/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: any; label: string; disabled?: boolean }[]
  loading?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, loading = false, disabled, ...restProps }, ref) => {
    return (
      <div
        className={cn(
          'relative inline-flex w-full items-center',
          disabled && 'opacity-60',
        )}
      >
        <select
          {...restProps}
          ref={ref}
          disabled={disabled || loading}
          className={cn(
            'flex w-full appearance-none items-center overflow-hidden rounded-lg border border-light-200 bg-light-secondary px-3 py-2 pr-10 text-xs lg:text-sm dark:border-dark-200 dark:bg-dark-secondary dark:text-white',
            className,
          )}
        >
          {options.map(({ label, value, disabled: optionDisabled }) => {
            return (
              <option key={value} value={value} disabled={optionDisabled}>
                {label}
              </option>
            )
          })}
        </select>
        <span className="pointer-events-none absolute right-3 flex h-4 w-4 items-center justify-center text-black/50 dark:text-white/60">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </div>
    )
  },
)

Select.displayName = 'Select'

export default Select
