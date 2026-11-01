// Secrets are set with `wrangler secret put` (or .dev.vars locally), not in wrangler.jsonc, so
// `wrangler types` cannot see them. Both are optional at runtime; the code fails closed.
interface Env {
  /** Comma-separated admin emails. A secret so the emails stay out of the public repo. */
  ADMIN_EMAILS?: string
  /** Local-only admin identity; ignored unless ENVIRONMENT=development on localhost. */
  DEV_ADMIN_EMAIL?: string
}
