import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'
import { useState, type ComponentProps } from 'react'
import { Field } from './Field'

/** A password `Field` with a button to show or hide what was typed. */
export function PasswordField(props: Omit<ComponentProps<typeof Field>, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeSlashIcon : EyeIcon

  return (
    <Field
      {...props}
      type={visible ? 'text' : 'password'}
      // While shown as text, stop mobile keyboards from capitalizing or autocorrecting it.
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="grid size-10 cursor-pointer place-items-center rounded-control border-0 bg-transparent text-muted hover:text-text focus-visible:shadow-focus focus-visible:outline-none"
        >
          <Icon aria-hidden size={20} />
        </button>
      }
    />
  )
}
