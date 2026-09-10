import type { InputHTMLAttributes, ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-neutral-50/95 px-4 py-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function Card({
  children,
  className = '',
  as: Tag = 'div',
  ...props
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'form'
} & Record<string, unknown>) {
  return (
    <Tag
      className={`rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{children}</h2>
}

export function StatTile({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'bad' | 'warn'
  hint?: string
}) {
  const toneClass = {
    default: 'text-neutral-900 dark:text-neutral-50',
    good: 'text-emerald-600 dark:text-emerald-400',
    bad: 'text-red-600 dark:text-red-400',
    warn: 'text-amber-600 dark:text-amber-400',
  }[tone]
  return (
    <div>
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const variants = {
    primary: 'bg-amber-700 text-white active:bg-amber-800 disabled:bg-neutral-300',
    secondary: 'bg-neutral-100 text-neutral-700 active:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200',
    danger: 'bg-red-600 text-white active:bg-red-700',
    ghost: 'bg-transparent text-amber-700 dark:text-amber-500',
  }[variant]
  return (
    <button
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 ${className}`}
      {...props}
    />
  )
}

export function MoneyInput({
  value,
  onChange,
  className = '',
  ...props
}: {
  value: number
  onChange: (v: number) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value === 0 ? '' : value}
      placeholder="0"
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className={`w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-right text-lg font-semibold tabular-nums text-neutral-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 ${className}`}
      {...props}
    />
  )
}

export function Banner({ tone, children }: { tone: 'bad' | 'warn' | 'good' | 'info'; children: ReactNode }) {
  const toneClass = {
    bad: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
    warn: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
    good: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
    info: 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
  }[tone]
  return <div className={`rounded-xl border px-3 py-2.5 text-sm ${toneClass}`}>{children}</div>
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div className="h-full rounded-full bg-amber-600" style={{ width: `${pct}%` }} />
    </div>
  )
}
