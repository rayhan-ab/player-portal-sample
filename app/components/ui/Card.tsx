import type { ComponentProps } from 'react'
import { cx } from './cx'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cx('grid gap-6 rounded-card border border-border bg-surface p-6 sm:p-8', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cx('m-0 text-(length:--ab-font-size-24)', className)} {...props} />
}
