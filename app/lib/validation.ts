/**
 * Input validation rules for registration fields, as configured per namespace
 * in IAM (Admin Portal > Input Validation). The server fetches them; the page
 * uses the same rules for instant feedback, and the server checks again on
 * submit, so the browser is never trusted.
 *
 * Shared by browser and server code, so this file must stay free of
 * server-only imports.
 */

export type FieldRule = {
  minLength: number
  maxLength: number
  /** A regular expression the whole value must match, if IAM sets one. */
  regex: string
  /** IAM's own description of the rule, for help text. */
  hints: string[]
}

export type FieldName = 'email' | 'password' | 'username' | 'displayName'

export type ValidationRules = Partial<Record<FieldName, FieldRule>>

const labels: Record<FieldName, string> = {
  email: 'Email',
  password: 'Password',
  username: 'Username',
  displayName: 'Display name'
}

const compiled = new Map<string, RegExp | null>()

function compile(pattern: string): RegExp | null {
  if (!compiled.has(pattern)) {
    try {
      // The `u` flag is needed for \p{L} classes IAM uses in display names.
      compiled.set(pattern, new RegExp(pattern, 'u'))
    } catch {
      try {
        compiled.set(pattern, new RegExp(pattern))
      } catch {
        // A pattern this JS engine can't read: the length rules still apply,
        // and IAM validates again when the account is created.
        compiled.set(pattern, null)
      }
    }
  }
  return compiled.get(pattern) ?? null
}

/** The first problem with a value, or null if it passes. */
export function validateField(field: FieldName, value: string, rules: ValidationRules): string | null {
  const label = labels[field]
  if (value.length === 0) return `${label} is required.`
  const rule = rules[field]
  if (!rule) return null
  if (value.length < rule.minLength) return `${label} must be at least ${rule.minLength} characters.`
  if (value.length > rule.maxLength) return `${label} must be at most ${rule.maxLength} characters.`
  const regex = rule.regex ? compile(rule.regex) : null
  if (regex && !regex.test(value)) {
    return rule.hints.length > 0 ? rule.hints.join(' ') : `${label} is not valid.`
  }
  return null
}
