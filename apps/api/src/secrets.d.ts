// Secrets are set with `wrangler secret put`, CI's `--secrets-file` (or .dev.vars locally), not
// in wrangler.jsonc, so `wrangler types` cannot see them. All are optional at runtime; the code
// fails closed.
interface Env {
  /** Access team domain, e.g. team.cloudflareaccess.com. Uploaded by CI on every deploy. */
  ACCESS_TEAM_DOMAIN?: string
  /** Audience (AUD) tag of the Access application for this Worker. Uploaded by CI. */
  ACCESS_AUD?: string
  /** Comma-separated admin emails. A secret so the emails stay out of the public repo. */
  ADMIN_EMAILS?: string
  /** Local-only admin identity; ignored unless ENVIRONMENT=development on localhost. */
  DEV_ADMIN_EMAIL?: string
  /** Optional. Turns on the AI cleanup button (docs/ingestion.md). Costs per token. */
  ANTHROPIC_API_KEY?: string
  /** Optional Worker variable: the model for AI cleanup (default in src/ai/claude.ts). */
  AI_MODEL?: string
}
