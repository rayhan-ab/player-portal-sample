import { useNavigation } from 'react-router'

/**
 * True while a form POST is in flight. Narrow it to one form with `action`
 * (the form's action path) or one button with `intent` (its name="intent"
 * value), so only the button that was pressed shows a spinner.
 */
export function useSubmitting({ action, intent }: { action?: string; intent?: string } = {}): boolean {
  const navigation = useNavigation()
  if (navigation.state === 'idle' || navigation.formMethod !== 'POST') return false
  if (action !== undefined && navigation.formAction !== action) return false
  if (intent !== undefined && navigation.formData?.get('intent') !== intent) return false
  return true
}
