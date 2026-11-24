import { CountryApi, InputValidationsApi } from '@accelbyte/sdk-iam'
import { PoliciesApi } from '@accelbyte/sdk-legal'
import type { FieldName, FieldRule, ValidationRules } from '~/lib/validation'
import { createAgsSdk } from './ags.server'
import { getEnv } from './env.server'

/**
 * Namespace settings that shape the sign-in and registration forms, read from
 * IAM's public endpoints and cached for a few minutes.
 */

export type RegistrationConfig = {
  /** Players sign in and register with email only; no username field. */
  usernameDisabled: boolean
  /** Display names must be unique; registration asks for one and checks it. */
  uniqueDisplayNameEnabled: boolean
  /** Registration needs a code sent to the player's email. */
  mandatoryEmailVerification: boolean
}

export type Country = { code: string; name: string }

export type LegalPolicy = {
  policyId: string
  policyVersionId: string
  localizedPolicyVersionId: string
  name: string
  url: string | null
  mandatory: boolean
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { value: unknown; expiresAt: number }>()

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T
  const value = await load()
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

async function readConfigFlag(key: string): Promise<boolean> {
  const { agsBaseUrl, agsNamespace } = getEnv()
  const response = await fetch(new URL(`/iam/v3/public/namespaces/${encodeURIComponent(agsNamespace)}/config/${key}`, agsBaseUrl))
  if (!response.ok) return false
  const body = (await response.json()) as { result?: Record<string, unknown> }
  return body.result?.[key] === true
}

export function getRegistrationConfig(): Promise<RegistrationConfig> {
  return cached('registration-config', async () => {
    const [usernameDisabled, uniqueDisplayNameEnabled, mandatoryEmailVerification] = await Promise.all([
      readConfigFlag('usernameDisabled'),
      readConfigFlag('uniqueDisplayNameEnabled'),
      readConfigFlag('mandatoryEmailVerificationEnabled')
    ])
    return { usernameDisabled, uniqueDisplayNameEnabled, mandatoryEmailVerification }
  })
}

const FIELDS: FieldName[] = ['email', 'password', 'username', 'displayName']

export function getValidationRules(): Promise<ValidationRules> {
  return cached('validation-rules', async () => {
    const { data } = await InputValidationsApi(createAgsSdk()).getInputValidations_v3({ languageCode: 'en-US' })
    const rules: ValidationRules = {}
    for (const item of data.data ?? []) {
      const field = item.field as FieldName
      if (!FIELDS.includes(field)) continue
      const validation = item.validation
      const hints = (validation.description?.message ?? []).filter(Boolean)
      const rule: FieldRule = {
        minLength: validation.minLength ?? 0,
        maxLength: validation.maxLength ?? 256,
        regex: validation.regex ?? '',
        hints
      }
      rules[field] = rule
    }
    return rules
  })
}

export function getCountries(): Promise<Country[]> {
  return cached('countries', async () => {
    const { data } = await CountryApi(createAgsSdk()).getCountries_v3()
    return data.map(({ code, name }) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
  })
}

/** Legal documents a player in this country must accept to register. */
export function getRegistrationPolicies(countryCode: string): Promise<LegalPolicy[]> {
  return cached(`policies:${countryCode}`, async () => {
    const { data } = await PoliciesApi(createAgsSdk()).getPolicyCountry_ByCountryCode_ByNS(countryCode, {
      policyType: 'LEGAL_DOCUMENT_TYPE',
      alwaysIncludeDefault: true
    })
    const policies: LegalPolicy[] = []
    for (const policy of data) {
      const version = policy.policyVersions?.find(v => v.isInEffect)
      const localized = version?.localizedPolicyVersions?.find(l => l.isDefaultSelection) ?? version?.localizedPolicyVersions?.[0]
      if (!version || !localized) continue
      policies.push({
        policyId: policy.id,
        policyVersionId: version.id,
        localizedPolicyVersionId: localized.id,
        name: policy.policyName,
        url: localized.attachmentLocation ?? null,
        mandatory: policy.isMandatory
      })
    }
    return policies
  })
}

/**
 * True if a username or unique display name is not taken yet. (IAM has no
 * such check for emails; a taken email shows up when the account is created.)
 */
export async function isAvailable(field: 'username' | 'uniqueDisplayName', value: string): Promise<boolean> {
  const { agsBaseUrl, agsNamespace } = getEnv()
  const url = new URL(`/iam/v3/public/namespaces/${encodeURIComponent(agsNamespace)}/users/availability`, agsBaseUrl)
  url.search = new URLSearchParams({ field, query: value }).toString()
  // IAM answers 404 when nobody has the value, 204 when it is taken.
  const response = await fetch(url)
  return response.status === 404
}
