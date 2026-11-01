import type { AccessIdentity } from './auth/access'

/** Hono environment shared by the app, middleware and routes. */
export interface AppEnv {
  Bindings: Env
  Variables: {
    /** Set by the site gate (private mode) or the admin check once a request is verified. */
    identity?: AccessIdentity
  }
}
