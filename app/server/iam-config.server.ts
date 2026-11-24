import { CountryApi, InputValidationsApi, ThirdPartyCredentialApi } from '@accelbyte/sdk-iam'
import { PoliciesApi } from '@accelbyte/sdk-legal'
import { isWebLoginPlatform, WEB_LOGIN_PLATFORMS, type WebLoginPlatform } from '~/lib/platforms'
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
const cache = new Map<string, { value: Promise<unknown>; expiresAt: number }>()

/**
 * Load a value once per TTL. Concurrent callers share one in-flight load, and a
 * load that fails is dropped so the next call tries again.
 */
export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as Promise<T>
  const value = load()
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key)
  })
  return value
}

/**
 * Read one boolean namespace setting. Throws if IAM doesn't answer with one,
 * so a failure is never cached as `false` (which would, for example, skip
 * mandatory email verification).
 */
async function readConfigFlag(key: string): Promise<boolean> {
  const { agsBaseUrl, agsNamespace } = getEnv()
  const response = await fetch(new URL(`/iam/v3/public/namespaces/${encodeURIComponent(agsNamespace)}/config/${key}`, agsBaseUrl))
  const body = (await response.json().catch(() => null)) as { result?: Record<string, unknown> } | null
  const value = body?.result?.[key]
  if (!response.ok || typeof value !== 'boolean') {
    throw new Error(`IAM config ${key} unavailable: HTTP ${response.status}`)
  }
  return value
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

/**
 * Platforms switched on in the namespace that a player can sign in with from
 * a website, in a fixed order. Empty if IAM can't be reached, so the sign-in
 * page still works with a password.
 */
export function getSocialPlatforms(): Promise<WebLoginPlatform[]> {
  // Catch outside the cache, so an IAM error isn't remembered as "no platforms".
  return cached('social-platforms', async () => {
    const { data } = await ThirdPartyCredentialApi(createAgsSdk()).getPlatformsClientsActive_v3()
    const active = new Set(data.filter(p => p.IsActive).map(p => p.PlatformId))
    return (Object.keys(WEB_LOGIN_PLATFORMS) as WebLoginPlatform[]).filter(id => active.has(id))
  }).catch(() => [])
}

/** True if a player may start a sign-in with this platform. */
export async function isSocialPlatform(id: string): Promise<boolean> {
  return isWebLoginPlatform(id) && (await getSocialPlatforms()).includes(id)
}
