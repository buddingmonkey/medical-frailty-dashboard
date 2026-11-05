## What this changes

<!-- One or two sentences. Link the issue it closes, e.g. "Closes #12". -->

## Why

<!-- The problem it solves, or the roadmap step (docs/roadmap.md). -->

## How it was tested

<!-- Tests added or changed, and what you checked by hand. -->

- [ ] `pnpm check` passes
- [ ] New behaviour has a test written first (`docs/testing.md`)

## Checklist

- [ ] No patient or member data: no field, upload path or log line that could hold a name, ID or claim
- [ ] CPT descriptions shown only as the state published them, with the citation
- [ ] Admin features only under `/admin` and `/api/admin`
- [ ] No secrets, tokens or account IDs in the code
- [ ] New public wording added to `docs/legal-review.md`
- [ ] Docs updated if behaviour or commands changed
- [ ] Screenshots for visible changes (light and dark theme)
