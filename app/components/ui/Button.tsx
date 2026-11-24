import { CircleNotchIcon } from '@phosphor-icons/react'
import type { ComponentProps } from 'react'
import { Link, useNavigation, useResolvedPath } from 'react-router'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'link'
type Size = 'md' | 'sm'

const base =
  'inline-flex items-center justify-center gap-2 rounded-control border font-bold leading-none ' +
  'transition-[background-color,border-color,color,transform] duration-(--ab-duration-standard) ' +
  'ease-(--ab-ease-standard) active:scale-97 disabled:pointer-events-none disabled:opacity-70 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-70 cursor-pointer no-underline'

const variants: Record<Variant, string> = {
  primary:
    'border-action bg-action text-on-action hover:border-action-hover hover:bg-action-hover ' +
    'hover:text-on-action active:bg-action-active',
  secondary: 'border-border-strong bg-surface-raised text-text hover:border-muted hover:bg-surface-hover hover:text-text',
  quiet: 'border-transparent bg-transparent text-text hover:bg-surface-hover hover:text-text',
  danger: 'border-danger bg-transparent text-danger hover:bg-danger hover:text-(--ab-neutral-0)',
  link: 'border-0 bg-transparent p-0 text-link hover:text-link-hover min-h-0'
}

const sizes: Record<Size, string> = {
  md: 'min-h-(--ab-control-md) px-6 text-(length:--ab-font-size-14)',
  sm: 'min-h-(--ab-control-sm) px-4 text-(length:--ab-font-size-12)'
}

type Common = { variant?: Variant; size?: Size }

export function Spinner({ size = 16 }: { size?: number }) {
  return <CircleNotchIcon aria-hidden size={size} weight="bold" className="shrink-0 animate-spin" />
}

export function buttonClass({ variant = 'primary', size = 'md' }: Common = {}, extra?: string) {
  return cx(base, variants[variant], variant === 'link' ? '' : sizes[size], extra)
}

/** `loading` shows a spinner before the label and disables the button. */
export function Button({
  variant,
  size,
  className,
  type = 'button',
  loading = false,
  disabled,
  children,
  ...props
}: ComponentProps<'button'> & Common & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

/** Shows a spinner while the page it links to is loading. */
export function ButtonLink({ variant, size, className, to, children, ...props }: ComponentProps<typeof Link> & Common) {
  const navigation = useNavigation()
  const target = useResolvedPath(to)
  const loading = navigation.state === 'loading' && navigation.location.pathname === target.pathname
  return (
    <Link
      to={to}
      className={buttonClass({ variant, size }, className)}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </Link>
  )
}
