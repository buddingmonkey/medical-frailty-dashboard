import type { AccessIdentity } from './auth/access'

/** Hono environment shared by the app, middleware and routes. */
export interface AppEnv {
  Bindings: Env
  Variables: {
    /** Set by the site gate (private mode) or the admin check once a request is verified. */
    identity?: AccessIdentity
    /** Set by the public cache middleware: the `data_version` the response is built from. */
    dataVersion?: number
    /** The built index.html, once a server-rendered page has fetched it. */
    indexHtml?: string
  }
}
