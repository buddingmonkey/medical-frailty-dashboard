import { env } from 'cloudflare:workers'
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose'

import type { AiCompletion } from '../ai/claude'
import { createApp } from '../app'

export const TEAM_DOMAIN = 'test-team.cloudflareaccess.com'
export const ISSUER = `https://${TEAM_DOMAIN}`
export const AUDIENCE = 'test-aud-tag'
export const ADMIN = 'admin@example.org'

const KID = 'test-key'
const signingKeys = await generateKeyPair('RS256')
const otherKeys = await generateKeyPair('RS256')

/** The JWKS Cloudflare Access would publish, holding only the real signing key. */
const jwks: JWTVerifyGetKey = createLocalJWKSet({
  keys: [{ ...(await exportJWK(signingKeys.publicKey)), kid: KID, alg: 'RS256' }],
})

interface TokenOptions {
  /** null = no email claim, like an Access service token. */
  email?: string | null
  issuer?: string
  audience?: string
  expiresIn?: string
  /** Sign with a key that is not in the JWKS. */
  wrongKey?: boolean
  extra?: JWTPayload
}

/** A Cloudflare Access style JWT. Valid unless an option says otherwise. */
export async function accessToken(options: TokenOptions = {}): Promise<string> {
  const { email = ADMIN, issuer = ISSUER, audience = AUDIENCE, expiresIn = '5m' } = options
  const claims: JWTPayload = { ...options.extra }
  if (email !== null) claims['email'] = email
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(options.wrongKey ? otherKeys.privateKey : signingKeys.privateKey)
}

/** Stand-in for the Claude API: records each call and answers with `fakeAi.answer`. */
export const fakeAi = {
  calls: [] as { apiKey: string; model: string; prompt: string }[],
  answer: (): AiCompletion => ({
    text: '{"rows":[]}',
    model: 'claude-opus-5-5',
    stopReason: 'end_turn',
    inputTokens: 1,
    outputTokens: 1,
  }),
}

export const app = createApp({
  getJwks: () => jwks,
  aiComplete: (apiKey, model, prompt) => {
    fakeAi.calls.push({ apiKey, model, prompt })
    return Promise.resolve(fakeAi.answer())
  },
})

/** Stand-in for the static assets binding, so tests do not depend on a web build. */
export const fakeAssets: Fetcher = {
  fetch: () =>
    Promise.resolve(
      new Response('<!doctype html><title>app</title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ),
  connect: () => {
    throw new Error('not used in tests')
  },
}

interface CallOptions {
  token?: string
  host?: string
  method?: string
  /** Sent as JSON. */
  body?: unknown
  /** Origin header; defaults to the site's own origin for writes. null = none. */
  origin?: string | null
  /** Overrides the JSON content type, or null for none. */
  contentType?: string | null
  /** Raw body, sent as is (instead of `body`). */
  rawBody?: string | Uint8Array<ArrayBuffer>
  vars?: Partial<Env>
}

/** Calls the app with a configured Access setup; `vars` overrides any binding. */
export function call(path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers()
  if (options.token) headers.set('Cf-Access-Jwt-Assertion', options.token)
  const host = options.host ?? 'frailty.example.com'
  const method = options.method ?? 'GET'
  const write = !['GET', 'HEAD'].includes(method)
  const origin = options.origin === undefined ? (write ? `http://${host}` : null) : options.origin
  if (origin !== null) headers.set('Origin', origin)
  const contentType =
    options.contentType === undefined
      ? options.body !== undefined || options.rawBody !== undefined
        ? 'application/json'
        : null
      : options.contentType
  if (contentType !== null) headers.set('content-type', contentType)
  const body =
    options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  return Promise.resolve(
    app.request(
      `http://${host}${path}`,
      { method, headers, ...(body === undefined ? {} : { body }) },
      {
        ...env,
        ENVIRONMENT: 'test',
        SITE_MODE: 'private',
        ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
        ACCESS_AUD: AUDIENCE,
        ADMIN_EMAILS: `${ADMIN}, Second.Admin@Example.org`,
        ...options.vars,
      },
    ),
  )
}
