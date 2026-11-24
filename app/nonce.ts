import { createContext as createReactContext, useContext } from 'react'
import { createContext } from 'react-router'

/**
 * The per-response CSP nonce.
 *
 * The root middleware creates it and stores it in the router context; the
 * server entry hands it to React through NonceContext so <Scripts> and
 * <ScrollRestoration> can put it on the inline scripts they render.
 */
export const nonceRouterContext = createContext<string>('')

export const NonceContext = createReactContext<string | undefined>(undefined)

export function useNonce(): string | undefined {
  return useContext(NonceContext)
}
