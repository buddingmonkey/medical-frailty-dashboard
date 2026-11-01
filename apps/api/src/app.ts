import { Hono } from 'hono'

import type { GetJwks } from './auth/access'
import { publicGetOnly } from './middleware/public-get-only'
import { requireAdmin } from './middleware/require-admin'
import { securityHeaders } from './middleware/security-headers'
import { siteGate } from './middleware/site-gate'
import { whoami } from './routes/admin/whoami'
import { health } from './routes/public/health'
import { robots } from './routes/robots'
import type { AppEnv } from './types'

export interface AppDeps {
  /** Access key set lookup. Production: the team's remote certs. Tests: a local key set. */
  getJwks: GetJwks
}

export function createApp({ getJwks }: AppDeps) {
  const app = new Hono<AppEnv>()

  app.use(securityHeaders)
  app.use(siteGate(getJwks))

  app.route('/robots.txt', robots)

  app.use('/api/public/*', publicGetOnly)
  app.route('/api/public/health', health)

  // Admin pages and API: the only places admin features may live (CLAUDE.md).
  const adminOnly = requireAdmin(getJwks)
  app.use('/api/admin/*', adminOnly)
  app.use('/admin', adminOnly)
  app.use('/admin/*', adminOnly)
  app.route('/api/admin/whoami', whoami)

  // Unknown API paths get a JSON 404, never the SPA's index.html.
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  // Everything else is the Vue build. Unknown paths fall back to index.html
  // (not_found_handling = single-page-application). The copy makes the headers mutable so the
  // middleware can add to them.
  app.all('*', async (c) => {
    const asset = await c.env.ASSETS.fetch(c.req.raw)
    return new Response(asset.body, asset)
  })

  app.onError((err, c) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: err.message,
        method: c.req.method,
        path: c.req.path,
      }),
    )
    return c.json({ error: 'Internal error' }, 500)
  })

  return app
}
