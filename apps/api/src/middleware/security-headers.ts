import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'

import { BEACON_ORIGIN, beaconToken, isAdminPath, REPORT_ORIGIN } from '../seo/analytics'
import type { AppEnv } from '../types'

// The header set from docs/security.md, "HTTP headers". Applied to every response, static
// assets included (wrangler.jsonc sets run_worker_first).
const headers = (analytics: boolean) =>
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      // Cloudflare Web Analytics only while CF_BEACON_TOKEN is set, and never on admin pages
      // (seo/analytics.ts).
      scriptSrc: analytics ? ["'self'", BEACON_ORIGIN] : ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: analytics ? ["'self'", REPORT_ORIGIN] : ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'same-origin',
    xFrameOptions: 'DENY',
  })

const strict = headers(false)
const withAnalytics = headers(true)

export const securityHeaders = createMiddleware<AppEnv>((c, next) =>
  beaconToken(c.env) !== null && !isAdminPath(c.req.path)
    ? withAnalytics(c, next)
    : strict(c, next),
)
