import { UsersApi, UsersV4Api } from '@accelbyte/sdk-iam'
import { useState, type FocusEvent, type SubmitEvent } from 'react'
import { data, Form, Link, redirect, useNavigation } from 'react-router'
import { AuthLayout } from '~/components/AuthLayout'
import { SocialSignIn } from '~/components/SocialSignIn'
import { Button } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Field } from '~/components/ui/Field'
import { PasswordField } from '~/components/ui/PasswordField'
import { SelectField } from '~/components/ui/SelectField'
import { validateField, type FieldName, type ValidationRules } from '~/lib/validation'
import { clientAuth, createAgsSdk } from '~/server/ags.server'
import { beginSignIn, getUser, signInWithPassword } from '~/server/auth.server'
import { getCountries, getRegistrationConfig, getSocialPlatforms, getValidationRules, isAvailable } from '~/server/iam-config.server'
import type { Route } from './+types/register'

export const meta: Route.MetaFunction = () => [{ title: 'Create an account · Player Portal' }]

type Values = {
  email: string
  username: string
  displayName: string
  password: string
  country: string
  dateOfBirth: string
  code: string
}

type FieldErrors = Partial<Record<keyof Values, string>>

/** Guess the player's country from the browser language (en-GB → GB). */
function countryFromLanguage(request: Request, codes: string[]): string {
  const region = (request.headers.get('Accept-Language') ?? '').match(/^[a-z]{2,3}-([A-Z]{2})/)?.[1]
  return region && codes.includes(region) ? region : codes.includes('US') ? 'US' : (codes[0] ?? '')
}

export async function loader({ request, context }: Route.LoaderArgs) {
  if (getUser(context)) throw redirect('/account')
  const [config, rules, countries, socialPlatforms] = await Promise.all([
    getRegistrationConfig(),
    getValidationRules(),
    getCountries(),
    getSocialPlatforms()
  ])
  const defaultCountry = countryFromLanguage(
    request,
    countries.map(c => c.code)
  )
  return { config, rules, countries, defaultCountry, socialPlatforms }
}

function readValues(form: FormData): Values {
  const text = (name: string) => String(form.get(name) ?? '').trim()
  return {
    email: text('email'),
    username: text('username'),
    displayName: text('displayName'),
    password: String(form.get('password') ?? ''),
    country: text('country'),
    dateOfBirth: text('dateOfBirth'),
    code: text('code').replace(/\s+/g, '')
  }
}

/** Age in whole years on today's date, or null for an invalid date. */
function ageOf(dateOfBirth: string): number | null {
  const born = new Date(`${dateOfBirth}T00:00:00Z`)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getUTCFullYear() - born.getUTCFullYear()
  const birthdayPassed =
    now.getUTCMonth() > born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() >= born.getUTCDate())
  if (!birthdayPassed) age--
  return age
}

/** Every check that needs no network call. Runs in the browser and on the server. */
function checkValues(values: Values, rules: ValidationRules, usernameDisabled: boolean): FieldErrors {
  const errors: FieldErrors = {}
  const check = (field: FieldName, key: keyof Values) => {
    const message = validateField(field, String(values[key]), rules)
    if (message) errors[key] = message
  }
  check('email', 'email')
  if (!usernameDisabled) check('username', 'username')
  check('displayName', 'displayName')
  check('password', 'password')
  if (!values.country) errors.country = 'Choose your country.'
  const age = ageOf(values.dateOfBirth)
  if (age === null || age < 0 || age > 120) errors.dateOfBirth = 'Enter your date of birth.'
  return errors
}

/** IAM error codes worth telling the player about, by field. */
function iamFieldError(errorCode: number, message: string): FieldErrors | null {
  const text = message.toLowerCase()
  if (errorCode === 10133 || (text.includes('email') && (text.includes('exist') || text.includes('taken') || text.includes('conflict'))))
    return { email: 'An account with this email already exists.' }
  if (text.includes('unique display name') || text.includes('uniquedisplayname')) return { displayName: 'This display name is taken.' }
  if (text.includes('username')) return { username: 'This username is taken.' }
  if (text.includes('verification code') || text.includes('code')) return { code: 'That code is not right or has expired.' }
  if (text.includes('age') || text.includes('date of birth')) return { dateOfBirth: 'You are not old enough to create an account.' }
  if (text.includes('password')) return { password: 'This password is not allowed. Try a different one.' }
  return null
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const values = readValues(form)
  const [config, rules] = await Promise.all([getRegistrationConfig(), getValidationRules()])

  // 1. Same checks as the browser, because the browser can't be trusted.
  const fieldErrors = checkValues(values, rules, config.usernameDisabled)
  if (Object.keys(fieldErrors).length > 0) return data({ fieldErrors, step: 'details' as const, error: null }, { status: 400 })

  // 2. Taken usernames and display names.
  const [usernameFree, displayNameFree] = await Promise.all([
    config.usernameDisabled ? true : isAvailable('username', values.username),
    config.uniqueDisplayNameEnabled ? isAvailable('uniqueDisplayName', values.displayName) : true
  ])
  if (!usernameFree) fieldErrors.username = 'This username is taken.'
  if (!displayNameFree) fieldErrors.displayName = 'This display name is taken.'
  if (Object.keys(fieldErrors).length > 0) return data({ fieldErrors, step: 'details' as const, error: null }, { status: 409 })

  const sdk = createAgsSdk()

  // 3. Email verification, when the namespace requires it: send a code first.
  if (config.mandatoryEmailVerification && !values.code) {
    try {
      await UsersApi(sdk).createUserCodeRequest_v3({ emailAddress: values.email, languageTag: 'en-US' })
    } catch {
      return data(
        { fieldErrors: {}, step: 'details' as const, error: 'We could not send a verification code. Try again in a minute.' },
        { status: 502 }
      )
    }
    return data({ fieldErrors: {}, step: 'verify' as const, error: null })
  }

  // 4. Create the account.
  try {
    await UsersV4Api(sdk, clientAuth()).createUser_v4({
      authType: 'EMAILPASSWD',
      emailAddress: values.email,
      password: values.password,
      // IAM ignores the username when the namespace has usernames turned off.
      username: config.usernameDisabled ? '' : values.username,
      displayName: values.displayName,
      ...(config.uniqueDisplayNameEnabled ? { uniqueDisplayName: values.displayName } : {}),
      country: values.country,
      dateOfBirth: values.dateOfBirth,
      reachMinimumAge: true,
      ...(values.code ? { code: values.code } : {})
    })
  } catch (error) {
    const body = (error as { response?: { data?: { errorCode?: number; errorMessage?: string } } }).response?.data
    const mapped = iamFieldError(Number(body?.errorCode ?? 0), String(body?.errorMessage ?? ''))
    const step = mapped?.code ? ('verify' as const) : ('details' as const)
    return data(
      { fieldErrors: mapped ?? {}, step, error: mapped ? null : 'We could not create your account. Please try again.' },
      { status: 400 }
    )
  }

  // 5. Sign the new player in.
  const signIn = await signInWithPassword(await beginSignIn('/account'), values.email, values.password)
  if (signIn instanceof Response) return signIn
  throw redirect('/login?returnTo=/account')
}

export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const { config, rules, countries, defaultCountry, socialPlatforms } = loaderData
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST'
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const verifying = actionData?.step === 'verify'

  // Server errors win until the player edits that field again.
  const errors: FieldErrors = { ...actionData?.fieldErrors, ...clientErrors }

  const validateOnBlur = (field: FieldName, key: keyof Values) => (event: FocusEvent<HTMLInputElement>) => {
    const message = validateField(field, event.currentTarget.value.trim(), rules)
    setClientErrors(current => ({ ...current, [key]: message ?? undefined }))
  }

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (verifying) return
    const found = checkValues(readValues(new FormData(event.currentTarget)), rules, config.usernameDisabled)
    setClientErrors(found)
    if (Object.keys(found).length > 0) event.preventDefault()
  }

  let submitLabel = verifying ? 'Verify and create account' : 'Create account'
  if (busy) submitLabel = 'Creating your account…'

  const passwordHelp = rules.password?.hints.length ? (
    <ul className="m-0 grid gap-1 pl-4">
      {rules.password.hints.map(hint => (
        <li key={hint}>{hint}</li>
      ))}
    </ul>
  ) : null

  return (
    <AuthLayout
      title={verifying ? 'Check your email' : 'Create an account'}
      intro={verifying ? 'We sent a verification code to your email. Enter it to finish.' : undefined}
    >
      {actionData?.error ? <Callout tone="error">{actionData.error}</Callout> : null}
      {/* A first sign-in with a platform creates the account, so the same buttons work here. */}
      {verifying ? null : <SocialSignIn platforms={socialPlatforms} returnTo="/account" />}

      <Form method="post" className="grid gap-5" noValidate onSubmit={onSubmit}>
        {/* The details stay in the form (hidden) while the code is entered, so they are sent again with it. */}
        <div className={verifying ? 'hidden' : 'grid gap-5'}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={rules.email?.maxLength}
            error={errors.email}
            onBlur={validateOnBlur('email', 'email')}
          />
          {config.usernameDisabled ? null : (
            <Field
              label="Username"
              name="username"
              autoComplete="username"
              required
              maxLength={rules.username?.maxLength}
              error={errors.username}
              help={rules.username?.hints.join(' ') || undefined}
              onBlur={validateOnBlur('username', 'username')}
            />
          )}
          <Field
            label="Display name"
            name="displayName"
            autoComplete="nickname"
            required
            maxLength={rules.displayName?.maxLength}
            error={errors.displayName}
            help={
              config.uniqueDisplayNameEnabled
                ? 'Other players see this name. It must be unique.'
                : rules.displayName?.hints.join(' ') || 'Other players see this name.'
            }
            onBlur={validateOnBlur('displayName', 'displayName')}
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            required
            maxLength={rules.password?.maxLength}
            error={errors.password}
            help={passwordHelp}
            onBlur={validateOnBlur('password', 'password')}
          />
          <SelectField label="Country" id="country" name="country" defaultValue={defaultCountry} error={errors.country}>
            {countries.map(c => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Field label="Date of birth" name="dateOfBirth" type="date" autoComplete="bday" required error={errors.dateOfBirth} />
        </div>

        {verifying ? (
          <Field
            label="Verification code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="[&_input]:font-mono [&_input]:tracking-[0.2em]"
            required
            autoFocus
            error={errors.code}
          />
        ) : null}

        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </Form>

      <p className="m-0 text-(length:--ab-font-size-14) text-secondary">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
