import type { Context } from 'hono'

const wantsJson = (c: Context): boolean => c.req.path.startsWith('/api/')

export function signInRequired(c: Context): Response {
  return wantsJson(c)
    ? c.json({ error: 'Sign-in required' }, 401)
    : c.text('Sign-in required. Open this site through its Cloudflare Access login.', 401)
}

export function notAnAdmin(c: Context): Response {
  return wantsJson(c)
    ? c.json({ error: 'Not an admin' }, 403)
    : c.text('This account is not an admin of this site.', 403)
}
