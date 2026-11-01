import { Hono } from 'hono'

import { publicGetOnly } from './middleware/public-get-only'
import { securityHeaders } from './middleware/security-headers'
import { health } from './routes/public/health'

export const app = new Hono<{ Bindings: Env }>()

app.use(securityHeaders)

app.use('/api/public/*', publicGetOnly)
app.route('/api/public/health', health)

// Unknown API paths get a JSON 404, never the SPA's index.html.
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

// Everything else is the Vue build. Unknown paths fall back to index.html
// (not_found_handling = single-page-application). The copy makes the headers mutable so the
// security-headers middleware can add to them.
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
