# Agent notes

Project rules, commands and the docs table are in [CLAUDE.md](CLAUDE.md). Read it first.

## ui-sdk

The web app (`apps/web`) uses ui-sdk (`@ui-sdk/vue`, `@ui-sdk/core`). Before you use ui-sdk:

1. Follow the `ui-sdk` skill if it is installed.
2. Read `apps/web/node_modules/@ui-sdk/vue/docs/llms.txt`.

To build a new component, also search `apps/web/node_modules/@ui-sdk/vue/docs/core.md` by
heading (`grep -n '^#'`), and read `rendering.md` in the same folder.

We do **not** load ui-sdk's theme (`@ui-sdk/core/web.css`). Style each part with Tailwind and
our tokens in `apps/web/src/styles/main.css`, through its `data-slot` and state attributes.
`main.css` declares `@layer ui-sdk;` first, so the small behaviour CSS ui-sdk adds at runtime
loses to ours. `index.html` has `<meta property="csp-nonce" content="none">`, so that CSS is
added as constructed style sheets, which our CSP (`style-src 'self'`) allows. Never add
`'unsafe-inline'` to the CSP for it.
