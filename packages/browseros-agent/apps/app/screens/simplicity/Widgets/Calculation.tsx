'use client'

import { Calculator, Equal } from 'lucide-react'

type CalculationWidgetProps = {
  expression: string
  result: number
}

const Calculation = ({ expression, result }: CalculationWidgetProps) => {
  return (
    <div className="rounded-lg border border-light-200 dark:border-dark-200">
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-black/60 dark:text-white/70">
            <Calculator className="h-4 w-4" />
            <span className="font-semibold text-xs uppercase tracking-wide">
              Expression
            </span>
          </div>
          <div className="rounded-lg border border-light-200 bg-light-secondary p-3 dark:border-dark-200 dark:bg-dark-secondary">
            <code className="break-all font-mono text-black text-sm dark:text-white">
              {expression}
            </code>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-black/60 dark:text-white/70">
            <Equal className="h-4 w-4" />
            <span className="font-semibold text-xs uppercase tracking-wide">
              Result
            </span>
          </div>
          <div className="rounded-xl border border-light-200 bg-light-secondary p-5 dark:border-dark-200 dark:bg-dark-secondary">
            <div className="font-bold font-mono text-4xl text-black tabular-nums dark:text-white">
              {result.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Calculation
