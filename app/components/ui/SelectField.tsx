import { CaretDownIcon } from '@phosphor-icons/react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { cx } from './cx'

type SelectFieldProps = ComponentProps<'select'> & {
  label: string
  /** Hint shown under the select. */
  help?: ReactNode
  /** Error shown under the select; also marks the select invalid. */
  error?: string
}

/** A labelled native select styled to match `Field`, with a custom caret. */
export function SelectField({ label, help, error, className, id, children, ...select }: SelectFieldProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const helpId = `${selectId}-help`
  const errorId = `${selectId}-error`
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx('grid gap-2', className)}>
      <label htmlFor={selectId} className={cx('text-(length:--ab-font-size-14) font-bold', error ? 'text-danger' : 'text-text')}>
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            'min-h-(--ab-control-md) w-full cursor-pointer appearance-none rounded-control border bg-bg-alt pr-11 pl-4 text-text outline-none',
            'transition-[border-color,box-shadow] duration-(--ab-duration-fast)',
            'hover:border-muted focus:border-focus focus:shadow-focus',
            error ? 'border-danger' : 'border-border-strong'
          )}
          {...select}
        >
          {children}
        </select>
        <CaretDownIcon
          aria-hidden
          size={16}
          weight="bold"
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
        />
      </div>
      {error ? (
        <p id={errorId} className="m-0 text-(length:--ab-font-size-12) text-danger">
          {error}
        </p>
      ) : null}
      {help ? (
        <div id={helpId} className="m-0 text-(length:--ab-font-size-12) text-muted">
          {help}
        </div>
      ) : null}
    </div>
  )
}
