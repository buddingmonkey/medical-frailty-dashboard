import type { MiddlewareHandler } from 'hono'

// Public routes are read only (docs/security.md). Anything but GET/HEAD gets a 405.
export const publicGetOnly: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    c.header('Allow', 'GET, HEAD')
    return c.json({ error: 'Method not allowed' }, 405)
  }
  return next()
}
