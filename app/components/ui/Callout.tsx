import type { ComponentProps } from 'react'
import { cx } from './cx'

type Tone = 'info' | 'success' | 'warning' | 'error' | 'neutral'

const tones: Record<Tone, string> = {
  info: 'border-info bg-info-soft text-info-strong',
  success: 'border-success bg-success-soft text-success-strong',
  warning: 'border-warning bg-warning-soft text-warning-strong',
  error: 'border-danger bg-danger-soft text-danger-strong',
  neutral: 'border-border bg-canvas text-secondary'
}

/** A status message. Errors are announced to screen readers immediately. */
export function Callout({ tone = 'info', className, ...props }: ComponentProps<'div'> & { tone?: Tone }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-[var(--ab-radius-8)] border px-5 py-4 text-[length:var(--ab-font-size-14)]', tones[tone], className)}
      {...props}
    />
  )
}
