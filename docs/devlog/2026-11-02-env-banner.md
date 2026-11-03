# 2026-11-02: Test-site banner

**Milestone:** after M5 (preview data, step 4)  •  **People:** project lead  •  **AI:** Claude Code, Opus main session

Start 22:36 CST, end 22:43 CST (`date`).

## Why
Preview will hold seed data, so it must never be mistaken for the real lists. The project lead
asked for a banner on that site only, "if we can inject it at build".

## What happened
1. **Run time, not build time.** CI builds once and deploys that build to both Workers. A
   build-time banner would need two builds, or would ship to production if the flag went
   wrong. The Worker now adds the banner from `ENVIRONMENT`, which each Worker already has.
   Anything other than exactly `production` shows a banner, so a missing or mistyped value
   shows it instead of hiding it.
2. `environmentBanner` middleware puts `<aside class="env-banner" aria-label="Test site">` at
   the start of `<body>` with HTMLRewriter. That covers the Vue shell and the server-rendered
   pages, and because it sits outside `#app`, client navigation keeps it. The text is fixed
   for each environment: "Preview site", "Local development", or "Test site" for anything else.
3. Found by the tests: Hono's `c.res` setter copies the old response's headers onto the new
   one, so the stale `Content-Length` came back, and it would have cut pages short. The
   middleware clears `c.res` first.
4. Gold with navy text, the existing highlight tokens (9:1). `pnpm check:full`: 52 e2e tests
   with axe pass with the banner on.
