import { Hono } from 'hono'

import { type AiComplete, claudeComplete } from './ai/claude'
import type { GetJwks } from './auth/access'
import { adminWriteGuard } from './middleware/admin-write-guard'
import { environmentBanner } from './middleware/environment-banner'
import { publicCache } from './middleware/public-cache'
import { publicGetOnly } from './middleware/public-get-only'
import { rateLimit } from './middleware/rate-limit'
import { requireAdmin } from './middleware/require-admin'
import { securityHeaders } from './middleware/security-headers'
import { siteGate } from './middleware/site-gate'
import { aiCleanupRoute } from './routes/admin/ai-cleanup'
import { audit } from './routes/admin/audit'
import { backupRoute } from './routes/admin/backup'
import { categoriesRoute } from './routes/admin/categories'
import { coverageRoute } from './routes/admin/coverage'
import { columnProfilesRoute } from './routes/admin/column-profiles'
import { conditionGroupsRoute } from './routes/admin/condition-groups'
import { draftsRoute } from './routes/admin/drafts'
import { launchReadinessRoute } from './routes/admin/launch-readiness'
import { maintenanceRoute, weeklyBackupRoute } from './routes/admin/maintenance'
import { refCodesRoute } from './routes/admin/ref-codes'
import { sources } from './routes/admin/sources'
import { ccsrCategoriesRoute, unifiedRoute } from './routes/admin/unified'
import { unifiedMappingsRoute } from './routes/admin/unified-mappings'
import { adminStates } from './routes/admin/states'
import { watch } from './routes/admin/watch'
import { whoami } from './routes/admin/whoami'
import { pagesRoute } from './routes/pages'
import { publicCategoriesRoute } from './routes/public/categories'
import { publicCodeDetailRoute } from './routes/public/code-detail'
import { publicCodeSearchRoute } from './routes/public/code-search'
import { publicCompareRoute } from './routes/public/compare'
import { health } from './routes/public/health'
import { publicOverviewRoute } from './routes/public/overview'
import { publicStates } from './routes/public/states'
import { publicStatesCompareRoute } from './routes/public/states-compare'
import { robots } from './routes/robots'
import { securityTxt } from './routes/security-txt'
import type { AppEnv } from './types'

export interface AppDeps {
  /** Access key set lookup. Production: the team's remote certs. Tests: a local key set. */
  getJwks: GetJwks
  /** The Claude call for AI cleanup. Production: the Anthropic SDK. Tests: a fake. */
  aiComplete?: AiComplete
}

export function createApp({ getJwks, aiComplete = claudeComplete }: AppDeps) {
  const app = new Hono<AppEnv>()

  app.use(securityHeaders)
  app.use(environmentBanner)
  app.use(siteGate(getJwks))

  app.route('/robots.txt', robots)
  app.route('/.well-known/security.txt', securityTxt)

  // Before the cache, so cached answers count too. Admin and pages are not limited (rate-limit.ts).
  app.use('/api/public/*', rateLimit)
  app.use('/api/public/*', publicGetOnly)
  app.route('/api/public/health', health)
  app.use('/api/public/states', publicCache)
  app.use('/api/public/states/*', publicCache)
  app.route('/api/public/states', publicStates)
  app.use('/api/public/compare', publicCache)
  app.route('/api/public/compare', publicCompareRoute)
  app.use('/api/public/overview', publicCache)
  app.route('/api/public/overview', publicOverviewRoute)
  app.use('/api/public/categories/*', publicCache)
  app.route('/api/public/categories', publicCategoriesRoute)
  app.use('/api/public/states-compare', publicCache)
  app.route('/api/public/states-compare', publicStatesCompareRoute)
  app.use('/api/public/codes/*', publicCache)
  // Before /api/public/codes/:system/:code, so `search` is never read as a code system.
  app.route('/api/public/codes/search', publicCodeSearchRoute)
  app.route('/api/public/codes', publicCodeDetailRoute)

  // Admin pages and API: the only places admin features may live (CLAUDE.md).
  const adminOnly = requireAdmin(getJwks)
  app.use('/api/admin/*', adminOnly)
  app.use('/api/admin/*', adminWriteGuard)
  app.use('/admin', adminOnly)
  app.use('/admin/*', adminOnly)
  app.route('/api/admin/whoami', whoami)
  app.route('/api/admin/audit', audit)
  app.route('/api/admin/backup/weekly', weeklyBackupRoute)
  app.route('/api/admin/backup', backupRoute)
  app.route('/api/admin/maintenance', maintenanceRoute)
  app.route('/api/admin/watch', watch)
  app.route('/api/admin/launch-readiness', launchReadinessRoute)
  app.route('/api/admin/states', adminStates)
  app.route('/api/admin/states', categoriesRoute)
  app.route('/api/admin/states', unifiedMappingsRoute)
  app.route('/api/admin/unified', unifiedRoute)
  app.route('/api/admin/ccsr-categories', ccsrCategoriesRoute)
  app.route('/api/admin/coverage', coverageRoute)
  app.route('/api/admin/condition-groups', conditionGroupsRoute)
  app.route('/api/admin/sources', sources)
  app.route('/api/admin/column-profiles', columnProfilesRoute)
  app.route('/api/admin/ref-codes', refCodesRoute)
  app.route('/api/admin/drafts', draftsRoute)
  app.route('/api/admin/ai-cleanup', aiCleanupRoute(aiComplete))

  // Unknown API paths get a JSON 404, never the SPA's index.html.
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  // Public pages with their content rendered in (docs/seo.md), downloads and the sitemap.
  app.route('/', pagesRoute)

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
