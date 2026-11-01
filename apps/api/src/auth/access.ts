import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Who is making the request, as vouched for by Cloudflare Access (or the dev bypass). */
export interface AccessIdentity {
  /** Null for Access service tokens, which carry `common_name` instead of an email. */
  email: string | null
  /** The local dev bypass identity, which counts as an admin. */
  devAdmin?: true
}

/** Returns the key set for an Access team (issuer URL, e.g. https://team.cloudflareaccess.com). */
export type GetJwks = (issuer: string) => JWTVerifyGetKey

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function log(level: 'warn' | 'error', message: string) {
  const line = JSON.stringify({ level, message })
  if (level === 'error') console.error(line)
  else console.warn(line)
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header (docs/security.md): RS256 signature against
 * the team's certs, issuer, audience and expiry. Returns null if anything is missing or wrong,
 * so callers fail closed.
 */
export async function verifyAccess(
  request: Request,
  env: Env,
  getJwks: GetJwks,
): Promise<AccessIdentity | null> {
  // Local development only: never active outside ENVIRONMENT=development on localhost.
  if (env.ENVIRONMENT === 'development' && env.DEV_ADMIN_EMAIL) {
    if (LOCAL_HOSTS.has(new URL(request.url).hostname))
      return { email: env.DEV_ADMIN_EMAIL, devAdmin: true }
  }

  const team = env.ACCESS_TEAM_DOMAIN.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  const audience = env.ACCESS_AUD.trim()
  if (!team || !audience) {
    log('error', 'Access is not configured (ACCESS_TEAM_DOMAIN or ACCESS_AUD is empty)')
    return null
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) return null

  const issuer = `https://${team}`
  try {
    const { payload } = await jwtVerify(token, getJwks(issuer), {
      issuer,
      audience,
      algorithms: ['RS256'],
    })
    return { email: typeof payload['email'] === 'string' ? payload['email'] : null }
  } catch (err) {
    // Expected for bad or expired tokens; anything else (e.g. certs unreachable) is logged.
    if (!(err instanceof errors.JOSEError)) throw err
    log('warn', `Access token rejected: ${err.code}`)
    return null
  }
}

/**
 * True for the dev bypass identity, or if the email is in the comma-separated ADMIN_EMAILS
 * (case-insensitive).
 */
export function isAdmin(identity: AccessIdentity, adminEmails: string | undefined): boolean {
  if (identity.devAdmin) return true
  if (!identity.email || !adminEmails) return false
  const email = identity.email.trim().toLowerCase()
  return adminEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .some((e) => e !== '' && e === email)
}
