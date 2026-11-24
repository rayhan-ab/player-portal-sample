import { useId, type ComponentProps, type ReactNode } from 'react'
import { cx } from './cx'

type FieldProps = ComponentProps<'input'> & {
  label: string
  /** Hint shown under the input. */
  help?: ReactNode
  /** Error shown under the input; also marks the input invalid. */
  error?: string
}

/** A labelled input with help text and an error message wired for screen readers. */
export function Field({ label, help, error, className, id, ...input }: FieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const helpId = `${inputId}-help`
  const errorId = `${inputId}-error`
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx('grid gap-2', className)}>
      <label htmlFor={inputId} className={cx('text-[length:var(--ab-font-size-14)] font-bold', error ? 'text-danger' : 'text-text')}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'min-h-[var(--ab-control-md)] w-full rounded-control border bg-bg-alt px-4 text-text outline-none',
          'transition-[border-color,box-shadow] duration-[var(--ab-duration-fast)] placeholder:text-muted',
          'hover:border-muted focus:border-focus focus:shadow-focus',
          error ? 'border-danger' : 'border-border-strong'
        )}
        {...input}
      />
      {error ? (
        <p id={errorId} className="m-0 text-[length:var(--ab-font-size-12)] text-danger">
          {error}
        </p>
      ) : null}
      {help ? (
        <div id={helpId} className="m-0 text-[length:var(--ab-font-size-12)] text-muted">
          {help}
        </div>
      ) : null}
    </div>
  )
}
