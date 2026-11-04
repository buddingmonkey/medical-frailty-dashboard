# Security policy

## Reporting a vulnerability

Please report security problems **privately** through GitHub:
**Security → Report a vulnerability** on this repository
([direct link](https://github.com/buddingmonkey/medical-frailty-dashboard/security/advisories/new)).
Do not open a public issue for a vulnerability.

Include what you found, how to reproduce it, and what an attacker could do with it. We aim to
reply within 7 days. This is a small volunteer project with no bug bounty.

## Scope

In scope: this repository's code and the deployed site (the public pages, the public API, and
the admin area and its API).

Out of scope: Cloudflare and GitHub themselves (report to them), denial-of-service and volume
testing, and social engineering.

## What the site holds

The site compares the code lists US states publish. It holds **no patient or member data**
and is designed never to. The admin area sits behind Cloudflare Access, a sign-in service, and
the site's own server checks each sign-in token again. See
[`docs/security.md`](docs/security.md) for the threat model.

## Supported versions

Only the current `main` branch and the deployed site are supported.
