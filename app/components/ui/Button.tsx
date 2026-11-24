import type { ComponentProps } from 'react'
import { Link } from 'react-router'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'link'
type Size = 'md' | 'sm'

const base =
  'inline-flex items-center justify-center gap-2 rounded-control border font-bold leading-none ' +
  'transition-[background-color,border-color,color,transform] duration-[var(--ab-duration-standard)] ' +
  'ease-[var(--ab-ease-standard)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-70 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-70 cursor-pointer no-underline'

const variants: Record<Variant, string> = {
  primary:
    'border-action bg-action text-on-action hover:border-action-hover hover:bg-action-hover ' +
    'hover:text-on-action active:bg-action-active',
  secondary: 'border-border-strong bg-surface-raised text-text hover:border-muted hover:bg-surface-hover hover:text-text',
  quiet: 'border-transparent bg-transparent text-text hover:bg-surface-hover hover:text-text',
  danger: 'border-danger bg-transparent text-danger hover:bg-danger hover:text-[var(--ab-neutral-0)]',
  link: 'border-0 bg-transparent p-0 text-link hover:text-link-hover min-h-0'
}

const sizes: Record<Size, string> = {
  md: 'min-h-[var(--ab-control-md)] px-6 text-[length:var(--ab-font-size-14)]',
  sm: 'min-h-[var(--ab-control-sm)] px-4 text-[length:var(--ab-font-size-12)]'
}

type Common = { variant?: Variant; size?: Size }

export function buttonClass({ variant = 'primary', size = 'md' }: Common = {}, extra?: string) {
  return cx(base, variants[variant], variant === 'link' ? '' : sizes[size], extra)
}

export function Button({ variant, size, className, type = 'button', ...props }: ComponentProps<'button'> & Common) {
  return <button type={type} className={buttonClass({ variant, size }, className)} {...props} />
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Common) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />
}
