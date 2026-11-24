import { createContext as createReactContext, useContext } from 'react'
import { createContext } from 'react-router'

/**
 * The per-response CSP nonce.
 *
 * The root middleware creates it and stores it in the router context; the
 * server entry hands it to React through NonceContext so <Links>, <Scripts>
 * and <ScrollRestoration> can put it on the tags they render.
 */
export const nonceRouterContext = createContext<string>('')

export const NonceContext = createReactContext<string | undefined>(undefined)

/**
 * The nonce on the server comes from NonceContext. In the browser there is no
 * context, so read it back from a script the server rendered; otherwise the
 * client renders `nonce={undefined}` and hydration reports a mismatch.
 * (`.nonce` still holds the value after the browser hides the attribute.)
 */
export function useNonce(): string | undefined {
  const nonce = useContext(NonceContext)
  if (nonce !== undefined || typeof document === 'undefined') return nonce
  return document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || undefined
}
